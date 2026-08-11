import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  e2eDatabaseUrl,
  prepareE2eDatabase,
} from "../e2e/seed-data.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

await prepareE2eDatabase();

const environment = { ...process.env };
for (const key of Object.keys(environment)) {
  if (key.toLowerCase() === "path") delete environment[key];
}
const systemRoot = process.env.SystemRoot || "C:\\Windows";
const safePathEntries = [path.dirname(process.execPath)];
if (process.platform === "win32") {
  safePathEntries.push(
    path.join(systemRoot, "System32"),
    systemRoot,
    path.join(systemRoot, "System32", "Wbem"),
  );
}
environment[process.platform === "win32" ? "Path" : "PATH"] =
  safePathEntries.join(path.delimiter);
Object.assign(environment, {
  APP_ORIGIN: "http://127.0.0.1:3100",
  DATABASE_URL: e2eDatabaseUrl,
  E2E_NAVIGATION_DELAY_MS: "400",
  JUDGE_COMPILE_TIMEOUT_MS: "5000",
  JUDGE_CONCURRENCY: "1",
  JUDGE_DOCKER_IMAGE: "oj-e2e-no-image",
  JUDGE_MAX_QUEUE_SIZE: "5",
  JUDGE_MODE: "docker",
  JUDGE_QUEUE_WAIT_TIMEOUT_MS: "5000",
  NEXT_DIST_DIR: ".next-e2e",
  NODE_ENV: "development",
  OJ_LISTEN_HOST: "127.0.0.1",
  SESSION_COOKIE_SECURE: "false",
  SESSION_SECRET: "e2e-only-session-secret-at-least-32-characters",
});

const nextCli = path.join(
  repositoryRoot,
  "node_modules",
  "next",
  "dist",
  "bin",
  "next",
);
const server = spawn(
  process.execPath,
  [nextCli, "dev", "--hostname", "127.0.0.1", "--port", "3100"],
  {
    cwd: repositoryRoot,
    env: environment,
    stdio: "inherit",
    windowsHide: true,
  },
);

let stopping = false;
function stop(signal) {
  if (stopping) return;
  stopping = true;
  server.kill(signal);
}

process.once("SIGINT", () => stop("SIGINT"));
process.once("SIGTERM", () => stop("SIGTERM"));
server.once("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
server.once("exit", (code) => {
  process.exit(code ?? 0);
});
