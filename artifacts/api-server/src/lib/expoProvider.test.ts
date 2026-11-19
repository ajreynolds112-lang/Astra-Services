import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  configureExpoDirectory,
  listExpoProjects,
  startExpoTestFlight,
} from "./expoProvider";

const originalFetch = globalThis.fetch;
const originalExpoToken = process.env.EXPO_TOKEN;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalExpoToken === undefined) {
    delete process.env.EXPO_TOKEN;
  } else {
    process.env.EXPO_TOKEN = originalExpoToken;
  }
});

function setMockFetch(handler: typeof fetch): void {
  globalThis.fetch = handler;
  process.env.EXPO_TOKEN = "test-token";
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("project discovery follows account cursors and returns projects from every account", async () => {
  const firstProjectId = "0e8505c7-3cd1-4c86-8407-111cdb7f6214";
  const secondProjectId = "f90a1df9-6c95-40d8-8c41-48765172032a";
  const requests: Array<{ query: string; variables: Record<string, unknown> }> = [];

  setMockFetch(async (_input, init) => {
    const request = JSON.parse(String(init?.body)) as {
      query: string;
      variables: Record<string, unknown>;
    };
    requests.push(request);
    if (request.query.includes("ExpoAccessibleProjects")) {
      return jsonResponse({
        data: {
          meActor: {
            accounts: [
              {
                id: "account-one",
                appsPaginated: {
                  pageInfo: { hasNextPage: true, endCursor: "account-one-cursor" },
                  edges: [
                    {
                      cursor: "project-one-cursor",
                      node: {
                        id: firstProjectId,
                        name: "First",
                        slug: "first",
                        ownerAccount: { name: "owner-one" },
                        githubRepository: {
                          githubRepositoryUrl: null,
                          metadata: { githubRepoUrl: "https://github.com/owner-one/first" },
                        },
                        githubRepositorySettings: { baseDirectory: "apps/first" },
                      },
                    },
                  ],
                },
              },
              {
                id: "account-two",
                appsPaginated: {
                  pageInfo: { hasNextPage: false, endCursor: "account-two-cursor" },
                  edges: [
                    {
                      cursor: "project-two-cursor",
                      node: {
                        id: secondProjectId,
                        name: "Second",
                        slug: "second",
                        ownerAccount: { name: "owner-two" },
                        githubRepository: null,
                        githubRepositorySettings: null,
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      });
    }

    assert.equal(request.query.includes("ExpoAccountProjectsPage"), true);
    assert.deepEqual(request.variables, {
      accountId: "account-one",
      first: 100,
      after: "account-one-cursor",
    });
    return jsonResponse({
      data: {
        account: {
          byId: {
            appsPaginated: {
              pageInfo: { hasNextPage: false, endCursor: "last-cursor" },
              edges: [],
            },
          },
        },
      },
    });
  });

  assert.deepEqual(await listExpoProjects(), [
    {
      id: firstProjectId,
      name: "First",
      slug: "first",
      owner: "owner-one",
      repositoryUrl: "https://github.com/owner-one/first",
      appDirectory: "apps/first",
    },
    {
      id: secondProjectId,
      name: "Second",
      slug: "second",
      owner: "owner-two",
      repositoryUrl: null,
      appDirectory: null,
    },
  ]);
  assert.equal(requests.length, 2);
});

test("directory configuration updates only existing base-directory settings", async () => {
  const projectId = "0e8505c7-3cd1-4c86-8407-111cdb7f6214";
  const repositoryId = "github-repository-id";
  const settingsId = "github-repository-settings-id";
  const requests: Array<{ query: string; variables: Record<string, unknown> }> = [];

  setMockFetch(async (_input, init) => {
    const request = JSON.parse(String(init?.body)) as {
      query: string;
      variables: Record<string, unknown>;
    };
    requests.push(request);
    if (request.query.includes("ExpoProjectGitHubSettings")) {
      return jsonResponse({
        data: {
          app: {
            byId: {
              id: projectId,
              githubRepository: { id: repositoryId },
              githubRepositorySettings: { id: settingsId, baseDirectory: "/" },
            },
          },
        },
      });
    }

    assert.equal(request.query.includes("updateGitHubRepositorySettings"), true);
    assert.equal(request.query.includes("createGitHubRepositorySettings"), false);
    assert.deepEqual(request.variables, {
      settingsId,
      baseDirectory: "artifacts/mobile",
    });
    return jsonResponse({
      data: {
        githubRepositorySettings: {
          updateGitHubRepositorySettings: {
            id: settingsId,
            baseDirectory: "artifacts/mobile",
            app: { id: projectId, githubRepository: { id: repositoryId } },
          },
        },
      },
    });
  });

  await configureExpoDirectory(projectId, "artifacts/mobile");
  assert.equal(requests.length, 2);
});

test("root directory configuration uses Expo's root baseDirectory and is idempotent", async () => {
  const projectId = "0e8505c7-3cd1-4c86-8407-111cdb7f6214";
  let requests = 0;
  setMockFetch(async () => {
    requests += 1;
    return jsonResponse({
      data: {
        app: {
          byId: {
            id: projectId,
            githubRepository: { id: "github-repository-id" },
            githubRepositorySettings: {
              id: "github-repository-settings-id",
              baseDirectory: "/",
            },
          },
        },
      },
    });
  });

  await configureExpoDirectory(projectId, "");
  assert.equal(requests, 1);
});

test("workflow dispatch sends the documented payload without undeclared inputs", async () => {
  const projectId = "0e8505c7-3cd1-4c86-8407-111cdb7f6214";
  const runId = "019d9d17-013a-7e05-89aa-4aa83ff68c32";
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;

  setMockFetch(async (input, init) => {
    if (String(input) === "https://api.expo.dev/graphql") {
      const request = JSON.parse(String(init?.body)) as { query: string };
      assert.equal(request.query.includes("ExpoProjectGitHubSettings"), true);
      return jsonResponse({
        data: {
          app: {
            byId: {
              githubRepository: { id: "github-repository-id" },
              githubRepositorySettings: {
                id: "github-repository-settings-id",
                baseDirectory: "artifacts/mobile",
              },
            },
          },
        },
      });
    }
    capturedUrl = String(input);
    capturedInit = init;
    return jsonResponse({
      data: {
        id: runId,
        url: `https://expo.dev/accounts/alrjr112/projects/cybazone/workflows/${runId}`,
      },
    });
  });

  assert.deepEqual(
    await startExpoTestFlight(
      projectId,
      "main",
      "artifacts/mobile",
      "astra-testflight.yml",
    ),
    {
      id: runId,
      url: `https://expo.dev/accounts/alrjr112/projects/cybazone/workflows/${runId}`,
    },
  );
  assert.equal(capturedUrl, "https://api.expo.dev/v2/workflows/dispatch");
  assert.equal(capturedInit?.method, "POST");
  assert.deepEqual(JSON.parse(String(capturedInit?.body)), {
    appId: projectId,
    gitRef: "main",
    fileName: "astra-testflight.yml",
  });
});