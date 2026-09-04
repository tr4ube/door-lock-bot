import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDirectory, "..");
const args = process.argv.slice(2);
const candidates = [];

if (process.platform !== "win32" && existsSync(join(root, ".pio-python", "platformio"))) {
  candidates.push({
    command: "python3",
    args: ["-m", "platformio", ...args],
    env: {
      ...process.env,
      PYTHONPATH: join(root, ".pio-python"),
      PLATFORMIO_CORE_DIR: join(root, ".platformio"),
    },
  });
}

if (process.platform === "win32") {
  candidates.push({
    command: join(homedir(), ".platformio", "penv", "Scripts", "platformio.exe"),
    args,
    env: process.env,
  });
} else {
  candidates.push({
    command: join(homedir(), ".platformio", "penv", "bin", "platformio"),
    args,
    env: process.env,
  });
}

candidates.push(
  { command: "pio", args, env: process.env },
  { command: "platformio", args, env: process.env },
);

for (const candidate of candidates) {
  const result = spawnSync(candidate.command, candidate.args, {
    cwd: root,
    env: candidate.env,
    stdio: "inherit",
    shell: false,
  });
  if (result.error?.code === "ENOENT") continue;
  if (result.error !== undefined) {
    console.error(result.error.message);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}

console.error("PlatformIO was not found. Install PlatformIO Core or the VS Code PlatformIO IDE extension.");
process.exit(1);
