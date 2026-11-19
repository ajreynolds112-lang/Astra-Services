// Self-hosted production: `node scripts/production.mjs build|db|start`, configured by .env.production.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
const envFile = path.join(root, process.env.ASTRA_ENV_FILE || ".env.production");
if (!existsSync(envFile)) {
  console.error(`Missing ${envFile}. Copy .env.production.example and fill it in.`);
  process.exit(1);
}
process.loadEnvFile(envFile);
const command = process.argv[2];
const required = command === "db" ? ["DATABASE_URL"] :
  ["DATABASE_URL", "VITE_CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY", "ASTRA_PUBLIC_URL"];
const missing = required.filter((key) => !process.env[key]?.trim());
if (missing.length) {
  console.error(`Missing production configuration: ${missing.join(", ")}`);
  process.exit(1);
}
Object.assign(process.env, {
  NODE_ENV: "production", ASTRA_STANDALONE: "true", BASE_PATH: "/",
  CLERK_PUBLISHABLE_KEY: process.env.VITE_CLERK_PUBLISHABLE_KEY,
});

function run(args, extra = {}) {
  const result = spawnSync("pnpm", args, { stdio: "inherit", env: { ...process.env, ...extra } });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (command === "build") {
  run(["run", "typecheck:libs"]);
  run(["--filter", "@workspace/api-server", "build"]);
  run(["--filter", "@workspace/astra", "build"], { PORT: "3000" });
} else if (command === "db") {
  run(["--filter", "@workspace/db", "push"]);
} else if (command === "start") {
  process.env.PORT = process.env.ASTRA_PORT || "8090";
  process.env.HOST ||= "127.0.0.1";
  process.env.ASTRA_STATIC_DIR = path.join(root, "artifacts/astra/dist/public");
  await import(pathToFileURL(path.join(root, "artifacts/api-server/dist/index.mjs")).href);
} else {
  console.error("Usage: node scripts/production.mjs build|db|start");
  process.exit(1);
}
