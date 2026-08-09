import { spawn } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { e2eDatabasePath } from "../e2e/seed-data.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const generatedConfigFiles = ["next-env.d.ts", "tsconfig.json"].map((name) =>
  path.join(repositoryRoot, name),
);
const originalConfig = new Map(
  await Promise.all(
    generatedConfigFiles.map(async (file) => [file, await readFile(file)]),
  ),
);
const playwrightCli = path.join(
  repositoryRoot,
  "node_modules",
  "@playwright",
  "test",
  "cli.js",
);

let exitCode = 1;
try {
  exitCode = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [playwrightCli, "test", ...process.argv.slice(2)],
      {
        cwd: repositoryRoot,
        env: process.env,
        stdio: "inherit",
        windowsHide: true,
      },
    );
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
} finally {
  await Promise.all(
    [...originalConfig].map(([file, content]) => writeFile(file, content)),
  );
  await rm(path.join(repositoryRoot, ".next-e2e"), {
    force: true,
    recursive: true,
  });
  await Promise.all(
    ["playwright-report", "test-results"].map((name) =>
      rm(path.join(repositoryRoot, name), {
        force: true,
        recursive: true,
      }),
    ),
  );
  for (const suffix of ["", "-journal", "-shm", "-wal"]) {
    await rm(`${e2eDatabasePath}${suffix}`, { force: true });
  }
}

process.exit(exitCode);
