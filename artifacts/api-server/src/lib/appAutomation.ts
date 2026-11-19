import { githubApi } from "./localDevelopment";
import type { AppRecord } from "./appRegistry";
import { githubRepository } from "./appAccess";
import { configureExpoDirectory } from "./expoProvider";
import { z } from "zod";

export const TESTFLIGHT_WORKFLOW = "astra-testflight.yml";
export const TESTFLIGHT_YAML = [
  "name: ASTRA TestFlight",
  "jobs:",
  "  build_ios:",
  "    name: Build iOS beta",
  "    type: build",
  "    params:",
  "      platform: ios",
  "      profile: testflight",
  "  submit_ios:",
  "    name: Submit beta to App Store Connect",
  "    needs: [build_ios]",
  "    type: submit",
  "    params:",
  "      build_id: ${{ needs.build_ios.outputs.build_id }}",
  "      profile: testflight",
  "",
].join("\n");

const repositoryMetadata = z.object({ default_branch: z.string().min(1) });
const sourceFile = z.object({ content: z.string().max(2_000_000), sha: z.string().min(1) });
const profileSchema = z.object({ ios: z.record(z.string(), z.unknown()).optional() }).passthrough();
const easSchema = z.object({
  build: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
  submit: z.record(z.string(), profileSchema).optional(),
}).passthrough();

async function github(path: string, method = "GET", body?: object) {
  const response = await githubApi(path, {
    method,
    ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    throw new Error(response.status === 404
      ? "The connected GitHub account cannot access this repository or its Expo configuration."
      : `GitHub could not complete the configuration (${response.status}). Check repository write permissions.`);
  }
  return response.json();
}

export async function configureTestFlight(app: AppRecord): Promise<{ branch: string; url: string }> {
  if (!app.repositoryUrl) throw new Error("Add this app's GitHub source repository first.");
  if (!app.ascAppId) throw new Error("Add the numeric App Store Connect app ID before configuring TestFlight.");
  const repo = githubRepository(app.repositoryUrl);
  const base = `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`;
  const metadata = repositoryMetadata.parse(await github(base));
  const branch = metadata.default_branch;
  const prefix = app.appDirectory ? `${app.appDirectory}/` : "";
  const easPath = `${prefix}eas.json`;
  const current = sourceFile.parse(await github(`${base}/contents/${easPath}?ref=${encodeURIComponent(branch)}`));
  let eas;
  try { eas = easSchema.parse(JSON.parse(Buffer.from(current.content, "base64").toString("utf8"))); }
  catch { throw new Error("The source repository's eas.json is not valid JSON."); }
  if (!eas.build?.production) throw new Error("Add a production build profile in the source repository's eas.json first.");
  await configureExpoDirectory(app.id, app.appDirectory);
  const updated = {
    ...eas,
    build: {
      ...eas.build,
      testflight: { ...eas.build.testflight, extends: "production", distribution: "store", autoIncrement: true },
    },
    submit: {
      ...eas.submit,
      testflight: {
        ...eas.submit?.production, ...eas.submit?.testflight,
        ios: { ...eas.submit?.production?.ios, ...eas.submit?.testflight?.ios, ascAppId: app.ascAppId },
      },
    },
  };
  await github(`${base}/contents/${easPath}`, "PUT", {
    message: "Configure ASTRA iOS beta build and TestFlight submission",
    content: Buffer.from(JSON.stringify(updated, null, 2) + "\n").toString("base64"),
    sha: current.sha, branch,
  });
  const workflowPath = `${prefix}.eas/workflows/${TESTFLIGHT_WORKFLOW}`;
  const priorResponse = await githubApi(`${base}/contents/${workflowPath}?ref=${encodeURIComponent(branch)}`, { method: "GET" });
  let sha: string | undefined;
  if (priorResponse.ok) sha = sourceFile.parse(await priorResponse.json()).sha;
  else if (priorResponse.status !== 404) throw new Error("Could not check the existing TestFlight workflow.");
  await github(`${base}/contents/${workflowPath}`, "PUT", {
    message: "Add manually triggered ASTRA TestFlight build workflow",
    content: Buffer.from(TESTFLIGHT_YAML).toString("base64"),
    ...(sha ? { sha } : {}), branch,
  });
  return { branch, url: `https://github.com/${repo.owner}/${repo.name}/blob/${encodeURIComponent(branch)}/${workflowPath}` };
}

export async function appSourceBranch(app: AppRecord): Promise<string> {
  if (!app.repositoryUrl) throw new Error("Source repository is not configured.");
  const repo = githubRepository(app.repositoryUrl);
  const metadata = repositoryMetadata.parse(await github(`/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`));
  return metadata.default_branch;
}