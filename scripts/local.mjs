import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
if (existsSync(path.join(root, ".env"))) process.loadEnvFile(path.join(root, ".env"));
const command = process.argv[2] ?? "dev";
if (!["dev", "db", "build"].includes(command)) {
  console.error("Usage: node scripts/local.mjs dev|db|build");
  process.exit(1);
}
const required = command === "db" ? ["DATABASE_URL"] :
  ["DATABASE_URL", "VITE_CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY"];
const missing = required.filter((key) => !process.env[key]?.trim());
if (missing.length) {
  console.error(`Missing local configuration: ${missing.join(", ")}. Copy .env.example to .env and configure it.`);
  process.exit(1);
}
const webPort = process.env.LOCAL_WEB_PORT || "3000";
const apiPort = process.env.LOCAL_API_PORT || "8080";
if ([webPort, apiPort].some((port) => !/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) || webPort === apiPort) {
  console.error("LOCAL_WEB_PORT and LOCAL_API_PORT must be different valid port numbers.");
  process.exit(1);
}
const env = {
  ...process.env, ASTRA_LOCAL_DEV: "true", BASE_PATH: "/", LOCAL_API_PORT: apiPort,
  CLERK_PUBLISHABLE_KEY: process.env.VITE_CLERK_PUBLISHABLE_KEY,
};
const children = new Set();
function start(args, extra = {}) {
  // Windows pnpm is a .cmd shim, so it needs the command shell.
  const child = spawn("pnpm", args, {
    cwd: root, stdio: "inherit", env: { ...env, ...extra },
    shell: process.platform === "win32",
    detached: process.platform !== "win32",
  });
  children.add(child);
  child.once("exit", () => children.delete(child));
  child.once("error", (error) => {
    console.error(`Could not start pnpm: ${error.message}`);
    stop(1);
  });
  return child;
}
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (process.platform === "win32" && child.pid) {
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    } else if (child.pid) {
      try { process.kill(-child.pid, "SIGTERM"); } catch (error) {
        if (error.code !== "ESRCH") console.error(`Could not stop child process: ${error.message}`);
      }
    }
  }
  process.exitCode = code;
  setTimeout(() => process.exit(code), 1500).unref();
}
process.once("SIGINT", () => stop(0));
process.once("SIGTERM", () => stop(0));

function run(args, extra) {
  return new Promise((resolve, reject) => {
    const child = start(args, extra);
    child.once("error", reject);
    child.once("exit", (code, signal) => code === 0 ? resolve() :
      reject(new Error(`pnpm ${args.join(" ")} exited with ${signal ?? code}`)));
  });
}

try {
  if (command === "db") {
    await run(["--filter", "@workspace/db", "push"]);
  } else {
    await run(["run", "typecheck:libs"]);
    if (command === "build") {
      await run(["--filter", "@workspace/api-server", "build"]);
      await run(["--filter", "@workspace/astra", "build"], { PORT: webPort, NODE_ENV: "production" });
    } else {
      console.log(`ASTRA: http://localhost:${webPort} (API: ${apiPort}). Ctrl+C stops both services.`);
      // Build once without the package's POSIX-only `export ...` dev command.
      await run(["--filter", "@workspace/api-server", "build"]);
      const api = start(["--filter", "@workspace/api-server", "start"], { PORT: apiPort, NODE_ENV: "development" });
      const web = start(["--filter", "@workspace/astra", "dev"], { PORT: webPort, NODE_ENV: "development" });
      for (const child of [api, web]) child.once("exit", (code) => stop(code ?? 1));
    }
  }
} catch (error) {
  console.error(error.message);
  stop(1);
}
