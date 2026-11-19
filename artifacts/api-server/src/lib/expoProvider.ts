export type ExpoProject = {
  id: string;
  name: string;
  slug: string;
  owner: string;
  repositoryUrl: string | null;
  appDirectory: string | null;
};

export type ExpoBuild = {
  id: string;
  status: string;
  platform: string;
  createdAt: string;
  version: string | null;
  buildNumber: string | null;
  url: string;
  artifactUrl: string | null;
};

const EXPO_GRAPHQL_URL = "https://api.expo.dev/graphql";
// Documented EAS Workflows REST API: https://docs.expo.dev/eas/workflows/rest-api/
const EXPO_WORKFLOW_DISPATCH_URL = "https://api.expo.dev/v2/workflows/dispatch";
const PAGE_SIZE = 100;
const PROJECT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Expo API returned an invalid ${field}.`);
  }
  return value;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function getToken(): string {
  const token = process.env.EXPO_TOKEN;
  if (!token) {
    throw new Error(
      "EXPO_TOKEN is not configured. Add an Expo access token with access to the required EAS projects.",
    );
  }
  return token;
}

function statusHelp(status: number, action: string): string {
  if (action === "workflow dispatch" && status === 400) {
    return "Expo workflow dispatch was rejected (HTTP 400). Check the workflow filename and its dispatch configuration.";
  }
  if (status === 401 || status === 403) {
    return `Expo ${action} request was denied (HTTP ${status}). Check that EXPO_TOKEN is valid and has access to the project.`;
  }
  if (status === 404) {
    return `Expo ${action} request returned not found (HTTP 404). Check the project ID, Git ref, and workflow file.`;
  }
  return `Expo ${action} request failed (HTTP ${status}).`;
}

async function readJson(response: Response, action: string): Promise<JsonObject> {
  if (!response.ok) {
    throw new Error(statusHelp(response.status, action));
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error(`Expo ${action} request returned an invalid JSON response.`);
  }
  if (!isObject(body)) {
    throw new Error(`Expo ${action} request returned an invalid response.`);
  }
  return body;
}

async function graphQL<T>(query: string, variables: JsonObject, action: string): Promise<T> {
  const token = getToken();
  let response: Response;
  try {
    response = await fetch(EXPO_GRAPHQL_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error(`Expo ${action} request failed due to a network or timeout error.`);
  }

  const body = await readJson(response, action);
  if (Array.isArray(body.errors) && body.errors.length > 0) {
    throw new Error(
      `Expo ${action} request was rejected. Check EXPO_TOKEN permissions and the requested project.`,
    );
  }
  if (!isObject(body.data)) {
    throw new Error(`Expo ${action} request returned an invalid response.`);
  }
  return body.data as T;
}

const PROJECT_PAGE_FIELDS = `
  pageInfo { hasNextPage endCursor }
  edges {
    cursor
    node {
      id
      name
      slug
      ownerAccount { name }
      githubRepository {
        githubRepositoryUrl
        metadata { githubRepoUrl }
      }
      githubRepositorySettings { baseDirectory }
    }
  }
`;

const FIRST_PROJECTS_QUERY = `
  query ExpoAccessibleProjects {
    meActor {
      accounts {
        id
        appsPaginated(first: ${PAGE_SIZE}) { ${PROJECT_PAGE_FIELDS} }
      }
    }
  }
`;

const ACCOUNT_PROJECTS_PAGE_QUERY = `
  query ExpoAccountProjectsPage($accountId: String!, $first: Int!, $after: String) {
    account {
      byId(accountId: $accountId) {
        appsPaginated(first: $first, after: $after) { ${PROJECT_PAGE_FIELDS} }
      }
    }
  }
`;

type ExpoProjectNode = {
  id: unknown;
  name: unknown;
  slug: unknown;
  ownerAccount: unknown;
  githubRepository: unknown;
  githubRepositorySettings: unknown;
};

type ProjectPage = {
  pageInfo: { hasNextPage: unknown; endCursor: unknown };
  edges: Array<{ cursor: unknown; node: ExpoProjectNode }>;
};

function parseProjectPage(value: unknown): ProjectPage {
  if (!isObject(value) || !isObject(value.pageInfo) || !Array.isArray(value.edges)) {
    throw new Error("Expo project listing returned an invalid pagination response.");
  }
  const hasNextPage = value.pageInfo.hasNextPage;
  const endCursor = value.pageInfo.endCursor;
  if (typeof hasNextPage !== "boolean" || (endCursor !== null && typeof endCursor !== "string")) {
    throw new Error("Expo project listing returned invalid pagination information.");
  }
  const edges = value.edges.map((edge) => {
    if (!isObject(edge) || !isObject(edge.node)) {
      throw new Error("Expo project listing returned an invalid project record.");
    }
    return { cursor: edge.cursor, node: edge.node as ExpoProjectNode };
  });
  return { pageInfo: { hasNextPage, endCursor }, edges };
}

function toExpoProject(node: ExpoProjectNode): ExpoProject {
  const ownerAccount = isObject(node.ownerAccount) ? node.ownerAccount : null;
  const githubRepository = isObject(node.githubRepository) ? node.githubRepository : null;
  const metadata =
    githubRepository && isObject(githubRepository.metadata) ? githubRepository.metadata : null;
  const githubSettings = isObject(node.githubRepositorySettings)
    ? node.githubRepositorySettings
    : null;

  return {
    id: requiredString(node.id, "project ID"),
    name: requiredString(node.name, "project name"),
    slug: requiredString(node.slug, "project slug"),
    owner: requiredString(ownerAccount?.name, "project owner"),
    repositoryUrl:
      optionalString(metadata?.githubRepoUrl) ??
      optionalString(githubRepository?.githubRepositoryUrl),
    appDirectory: optionalString(githubSettings?.baseDirectory),
  };
}

function ensureProjectPageIsComplete(page: ProjectPage): void {
  if (page.pageInfo.hasNextPage && !page.pageInfo.endCursor) {
    throw new Error("Expo project listing reported another page without a pagination cursor.");
  }
}

export async function listExpoProjects(): Promise<ExpoProject[]> {
  const firstPageData = await graphQL<{
    meActor: null | { accounts: Array<{ id: unknown; appsPaginated: unknown }> };
  }>(FIRST_PROJECTS_QUERY, {}, "project listing");

  if (!firstPageData.meActor || !Array.isArray(firstPageData.meActor.accounts)) {
    throw new Error(
      "Expo project listing could not resolve the EXPO_TOKEN account. Use a valid Expo user or robot access token.",
    );
  }

  const projects = new Map<string, ExpoProject>();
  for (const account of firstPageData.meActor.accounts) {
    const accountId = requiredString(account.id, "account ID");
    let page = parseProjectPage(account.appsPaginated);
    const seenCursors = new Set<string>();

    while (true) {
      ensureProjectPageIsComplete(page);
      for (const edge of page.edges) {
        const project = toExpoProject(edge.node);
        projects.set(project.id, project);
      }

      if (!page.pageInfo.hasNextPage) break;
      const cursor = requiredString(page.pageInfo.endCursor, "project pagination cursor");
      if (seenCursors.has(cursor)) {
        throw new Error("Expo project listing returned a repeated pagination cursor.");
      }
      seenCursors.add(cursor);

      const nextData = await graphQL<{
        account: null | { byId: null | { appsPaginated: unknown } };
      }>(
        ACCOUNT_PROJECTS_PAGE_QUERY,
        { accountId, first: PAGE_SIZE, after: cursor },
        "project listing",
      );
      const nextPage = nextData.account?.byId?.appsPaginated;
      if (!nextPage) {
        throw new Error("Expo project listing could not retrieve the next account page.");
      }
      page = parseProjectPage(nextPage);
    }
  }

  return [...projects.values()];
}

function isExpoProjectId(value: string): boolean {
  return PROJECT_ID_PATTERN.test(value);
}

const BUILDS_QUERY = `
  query ExpoProjectBuilds($appId: String!) {
    app {
      byId(appId: $appId) {
        id
        name
        slug
        ownerAccount { name }
        buildsPaginated(first: 5) {
          edges {
            node {
              ... on Build {
                id
                status
                platform
                createdAt
                appVersion
                appBuildVersion
                artifacts { buildUrl }
              }
            }
          }
        }
      }
    }
  }
`;

type BuildNode = {
  id: unknown;
  status: unknown;
  platform: unknown;
  createdAt: unknown;
  appVersion: unknown;
  appBuildVersion: unknown;
  artifacts: unknown;
};

export async function listExpoBuilds(projectId: string): Promise<ExpoBuild[]> {
  if (!isExpoProjectId(projectId)) {
    throw new Error("Invalid Expo project ID. Expected a project UUID.");
  }

  const data = await graphQL<{
    app: null | {
      byId: null | {
        id: unknown;
        name: unknown;
        slug: unknown;
        ownerAccount: unknown;
        buildsPaginated: null | { edges: Array<{ node: BuildNode }> };
      };
    };
  }>(BUILDS_QUERY, { appId: projectId }, "build listing");
  const app = data.app?.byId;
  if (!app) {
    throw new Error("Expo build listing could not find that project or the token lacks access.");
  }
  const owner = isObject(app.ownerAccount) ? app.ownerAccount.name : null;
  const ownerName = requiredString(owner, "project owner");
  const projectSlug = requiredString(app.slug, "project slug");
  if (!app.buildsPaginated || !Array.isArray(app.buildsPaginated.edges)) {
    throw new Error("Expo build listing returned an invalid build response.");
  }

  const builds = app.buildsPaginated.edges.map(({ node }) => {
    if (!isObject(node)) {
      throw new Error("Expo build listing returned an invalid build record.");
    }
    const artifacts = isObject(node.artifacts) ? node.artifacts : null;
    const buildId = requiredString(node.id, "build ID");
    return {
      id: buildId,
      status: requiredString(node.status, "build status"),
      platform: requiredString(node.platform, "build platform"),
      createdAt: requiredString(node.createdAt, "build creation time"),
      version: optionalString(node.appVersion),
      buildNumber: optionalString(node.appBuildVersion),
      url: `https://expo.dev/accounts/${encodeURIComponent(ownerName)}/projects/${encodeURIComponent(projectSlug)}/builds/${encodeURIComponent(buildId)}`,
      artifactUrl: optionalString(artifacts?.buildUrl),
    };
  });
  builds.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  if (builds.some((build) => !Number.isFinite(Date.parse(build.createdAt)))) {
    throw new Error("Expo build listing returned an invalid build creation time.");
  }
  return builds.slice(0, 5);
}

function validateGitRef(gitRef: string): void {
  const components = gitRef.split("/");
  if (
    gitRef.length === 0 ||
    gitRef.length > 255 ||
    gitRef.trim() !== gitRef ||
    gitRef.startsWith("-") ||
    gitRef.endsWith("/") ||
    gitRef.endsWith(".") ||
    gitRef.includes("//") ||
    gitRef.includes("..") ||
    gitRef.includes("@{") ||
    gitRef === "@" ||
    /[\u0000-\u0020\u007f\\~^:?*[\]]/.test(gitRef) ||
    components.some((component) => component.length === 0 || component.startsWith(".") || component.endsWith(".lock"))
  ) {
    throw new Error("Invalid Git ref. Use a valid branch, tag, or commit SHA.");
  }
}

function normalizeAppDirectory(appDirectory: string): string {
  if (typeof appDirectory !== "string") {
    throw new Error("Invalid app directory. Use a repository-relative path.");
  }
  if (appDirectory === "" || appDirectory === "/" || appDirectory === "." || appDirectory === "./") {
    return "/";
  }

  const normalized = appDirectory.replace(/^(?:\.\/)+/, "").replace(/\/+$/, "");
  if (
    normalized.length === 0 ||
    normalized.length > 512 ||
    normalized.startsWith("/") ||
    normalized.includes("\\") ||
    normalized.split("/").some((component) => component === "." || component === ".." || component === "")
  ) {
    throw new Error("Invalid app directory. Use a repository-relative path without '..' segments.");
  }
  return normalized;
}

function validateWorkflowFile(workflowFile: string): void {
  if (
    workflowFile.length === 0 ||
    workflowFile.length > 128 ||
    workflowFile.includes("/") ||
    workflowFile.includes("\\") ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]*\.ya?ml$/i.test(workflowFile)
  ) {
    throw new Error("Invalid workflow file. Provide only its .yml or .yaml filename.");
  }
}

export async function startExpoTestFlight(
  projectId: string,
  gitRef: string,
  appDirectory: string,
  workflowFile: string,
): Promise<{ id: string; url: string }> {
  if (!isExpoProjectId(projectId)) {
    throw new Error("Invalid Expo project ID. Expected a project UUID.");
  }
  validateGitRef(gitRef);
  const baseDirectory = normalizeAppDirectory(appDirectory);
  validateWorkflowFile(workflowFile);
  await requireConfiguredExpoDirectory(projectId, baseDirectory);

  const token = getToken();
  let response: Response;
  try {
    // The documented dispatch API resolves .eas/workflows/<fileName> from
    // the configured project base directory. It accepts only the bare file
    // name here; appDirectory is verified above, not sent as an input.
    response = await fetch(EXPO_WORKFLOW_DISPATCH_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        appId: projectId,
        gitRef,
        fileName: workflowFile,
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error("Expo workflow dispatch failed due to a network or timeout error.");
  }

  if (response.status !== 200) {
    throw new Error(statusHelp(response.status, "workflow dispatch"));
  }
  const body = await readJson(response, "workflow dispatch");
  const data = body.data;
  if (!isObject(data)) {
    throw new Error("Expo workflow dispatch returned an invalid response.");
  }
  const id = requiredString(data.id, "workflow run ID");
  const url = requiredString(data.url, "workflow run URL");
  if (!PROJECT_ID_PATTERN.test(id)) {
    throw new Error("Expo workflow dispatch returned an invalid workflow run ID.");
  }
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error("Expo workflow dispatch returned an invalid workflow run URL.");
  }
  const route = parsedUrl.pathname.split("/");
  if (
    parsedUrl.protocol !== "https:" ||
    parsedUrl.hostname !== "expo.dev" ||
    parsedUrl.search.length > 0 ||
    parsedUrl.hash.length > 0 ||
    route.length !== 7 ||
    route[1] !== "accounts" ||
    route[3] !== "projects" ||
    route[5] !== "workflows" ||
    route[6] !== id
  ) {
    throw new Error("Expo workflow dispatch returned an invalid workflow run URL.");
  }
  return { id, url };
}

const PROJECT_GITHUB_SETTINGS_QUERY = `
  query ExpoProjectGitHubSettings($appId: String!) {
    app {
      byId(appId: $appId) {
        id
        githubRepository { id }
        githubRepositorySettings { id baseDirectory }
      }
    }
  }
`;

// The mutation and input fields were verified against the live Expo GraphQL
// schema at https://api.expo.dev/graphql. Its update input contains only
// baseDirectory, so the repository linkage cannot be replaced by this call.
const UPDATE_GITHUB_REPOSITORY_BASE_DIRECTORY_MUTATION = `
  mutation UpdateExpoProjectBaseDirectory($settingsId: ID!, $baseDirectory: String!) {
    githubRepositorySettings {
      updateGitHubRepositorySettings(
        githubRepositorySettingsId: $settingsId
        githubRepositorySettingsData: { baseDirectory: $baseDirectory }
      ) {
        id
        baseDirectory
        app {
          id
          githubRepository { id }
        }
      }
    }
  }
`;

type ProjectGitHubSettings = {
  repositoryId: string;
  settingsId: string;
  baseDirectory: string;
};

async function getProjectGitHubSettings(projectId: string): Promise<ProjectGitHubSettings> {
  const data = await graphQL<{
    app: null | {
      byId: null | {
        githubRepository: null | { id: unknown };
        githubRepositorySettings: null | { id: unknown; baseDirectory: unknown };
      };
    };
  }>(PROJECT_GITHUB_SETTINGS_QUERY, { appId: projectId }, "GitHub repository settings");

  const app = data.app?.byId;
  if (!app) {
    throw new Error("Expo GitHub settings could not find that project or the token lacks access.");
  }
  const repository = app.githubRepository;
  if (!repository) {
    throw new Error(
      "No GitHub repository is linked to this Expo project. Link the repository in Expo project GitHub settings first.",
    );
  }
  const settings = app.githubRepositorySettings;
  if (!settings) {
    throw new Error(
      "Expo has no existing GitHub repository settings to update. Configure the linked repository in Expo project GitHub settings first.",
    );
  }

  return {
    repositoryId: requiredString(repository.id, "GitHub repository ID"),
    settingsId: requiredString(settings.id, "GitHub repository settings ID"),
    baseDirectory: normalizeAppDirectory(
      requiredString(settings.baseDirectory, "GitHub repository base directory"),
    ),
  };
}

async function requireConfiguredExpoDirectory(
  projectId: string,
  expectedBaseDirectory: string,
): Promise<void> {
  const settings = await getProjectGitHubSettings(projectId);
  if (settings.baseDirectory !== expectedBaseDirectory) {
    throw new Error(
      `Expo's GitHub base directory does not match this app directory. Run Configure first to set the existing Expo repository settings to "${expectedBaseDirectory}".`,
    );
  }
}

/**
 * Aligns the existing Expo GitHub repository settings with the app's repository
 * directory. The update mutation accepts only baseDirectory, so repository
 * linkage is preserved; this function never creates or replaces that linkage.
 * Expo documents GitHub base-directory setup for subdirectory apps at
 * https://docs.expo.dev/build/building-from-github/; EAS workflow files are
 * resolved from the project root (https://docs.expo.dev/eas/workflows/syntax/).
 */
export async function configureExpoDirectory(
  projectId: string,
  appDirectory: string,
): Promise<void> {
  if (!isExpoProjectId(projectId)) {
    throw new Error("Invalid Expo project ID. Expected a project UUID.");
  }
  const baseDirectory = normalizeAppDirectory(appDirectory);
  const existing = await getProjectGitHubSettings(projectId);
  if (existing.baseDirectory === baseDirectory) return;

  const mutationData = await graphQL<{
    githubRepositorySettings: null | {
      updateGitHubRepositorySettings: null | {
        id: unknown;
        baseDirectory: unknown;
        app: null | {
          id: unknown;
          githubRepository: null | { id: unknown };
        };
      };
    };
  }>(
    UPDATE_GITHUB_REPOSITORY_BASE_DIRECTORY_MUTATION,
    { settingsId: existing.settingsId, baseDirectory },
    "GitHub repository settings update",
  );
  const updated = mutationData.githubRepositorySettings?.updateGitHubRepositorySettings;
  if (!updated) {
    throw new Error("Expo did not return the updated GitHub repository settings.");
  }
  const linkedApp = updated.app;
  const updatedRepository = linkedApp?.githubRepository;
  if (
    requiredString(updated.id, "GitHub repository settings ID") !== existing.settingsId ||
    requiredString(linkedApp?.id, "project ID") !== projectId ||
    requiredString(updatedRepository?.id, "GitHub repository ID") !==
      existing.repositoryId ||
    normalizeAppDirectory(requiredString(updated.baseDirectory, "GitHub repository base directory")) !==
      baseDirectory
  ) {
    throw new Error(
      "Expo GitHub repository settings update could not be verified. Check the project settings before starting a workflow.",
    );
  }
}