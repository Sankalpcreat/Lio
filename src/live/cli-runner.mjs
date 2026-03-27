import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const execFileAsync = promisify(execFile);

const MUTATING_TOOL_NAMES = new Set([
  "slack_cli",
  "slack_write",
  "notion_cli",
  "notion_write",
  "apple_cli",
  "apple_write"
]);

function coerceStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
}

function resolveBinaryPath(cliName, providedPath) {
  const trimmed = String(providedPath ?? "").trim();
  return trimmed || cliName;
}

export async function runCliTool({
  toolName,
  cliName,
  binaryPath,
  args,
  unsafeMode
}) {
  const normalizedArgs = coerceStringArray(args);
  const executable = resolveBinaryPath(cliName, binaryPath);

  if (MUTATING_TOOL_NAMES.has(toolName) && !unsafeMode) {
    return {
      ok: false,
      blocked: true,
      reason: "This tool is marked as mutating. Enable Unsafe Mode in the UI to allow write operations.",
      executable,
      args: normalizedArgs
    };
  }

  try {
    const { stdout, stderr } = await execFileAsync(executable, normalizedArgs, {
      timeout: 60_000,
      maxBuffer: 8 * 1024 * 1024,
      env: process.env
    });

    return {
      ok: true,
      executable,
      args: normalizedArgs,
      cwd: process.cwd(),
      stdout: stdout.trim(),
      stderr: stderr.trim()
    };
  } catch (error) {
    const exitCode =
      typeof error?.code === "number"
        ? error.code
        : typeof error?.code === "string"
          ? error.code
          : null;

    return {
      ok: false,
      executable,
      args: normalizedArgs,
      cwd: process.cwd(),
      exitCode,
      stdout: String(error?.stdout ?? "").trim(),
      stderr: String(error?.stderr ?? "").trim(),
      message: error?.message ?? `Failed to run ${path.basename(executable)}`
    };
  }
}
