import { access, copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { SettingsStore } from "./settings-store.mjs";

const execFileAsync = promisify(execFile);

const TOOL_METADATA = {
  slack: {
    binaryName: "slack-cli",
    learnMoreUrl: "https://github.com/Sankalpcreat/Slack-Cli",
    authUrl: "https://api.slack.com/apps"
  },
  notion: {
    binaryName: "notion",
    learnMoreUrl: "https://github.com/Sankalpcreat/Notion-CLI",
    authUrl: "https://www.notion.so/profile/integrations"
  },
  apple: {
    binaryName: "apple",
    learnMoreUrl: "https://github.com/Sankalpcreat/Apple-CLI"
  }
};

function clip(value, maxLength = 600) {
  const text = String(value ?? "").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function exists(targetPath) {
  if (!targetPath) {
    return false;
  }

  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function runProbe(command, args, envOverrides = {}) {
  try {
    const result = await execFileAsync(command, args, {
      timeout: 15_000,
      maxBuffer: 4 * 1024 * 1024,
      env: {
        ...process.env,
        ...envOverrides
      }
    });

    return {
      ok: true,
      stdout: String(result.stdout ?? "").trim(),
      stderr: String(result.stderr ?? "").trim()
    };
  } catch (error) {
    return {
      ok: false,
      stdout: String(error?.stdout ?? "").trim(),
      stderr: String(error?.stderr ?? "").trim(),
      message: error?.message ?? "Command failed"
    };
  }
}

function summarizeProbe(probe) {
  return clip(probe.stderr || probe.stdout || probe.message || "Unknown error");
}

export class OnboardingService {
  constructor({ userDataDir, projectDir, resourcesPath }) {
    this.userDataDir = userDataDir;
    this.projectDir = projectDir;
    this.resourcesPath = resourcesPath;
    this.settingsStore = new SettingsStore(userDataDir);
    this.toolsDir = path.join(userDataDir, "tools");
  }

  async ensureToolsDir() {
    await mkdir(this.toolsDir, { recursive: true });
  }

  bundledBinaryPath(service) {
    const meta = TOOL_METADATA[service];
    if (!meta) {
      throw new Error(`Unknown service: ${service}`);
    }

    const packagedPath = path.join(this.resourcesPath, "prebuilt", "macos-arm64", meta.binaryName);
    const devPath = path.join(this.projectDir, "assets", "prebuilt", "macos-arm64", meta.binaryName);
    return { packagedPath, devPath };
  }

  installedBinaryPath(service) {
    return path.join(this.toolsDir, TOOL_METADATA[service].binaryName);
  }

  async installTool(service) {
    if (!TOOL_METADATA[service]) {
      throw new Error(`Unsupported tool: ${service}`);
    }

    await this.ensureToolsDir();
    const destination = this.installedBinaryPath(service);
    const { packagedPath, devPath } = this.bundledBinaryPath(service);
    const source = await exists(packagedPath) ? packagedPath : devPath;

    if (!await exists(source)) {
      throw new Error(`Prebuilt ${service} binary is not bundled with this app.`);
    }

    await copyFile(source, destination);
    await execFileAsync("/bin/chmod", ["755", destination]);

    const patch = {
      tools: {
        [service]: {
          binaryPath: destination
        }
      }
    };

    await this.settingsStore.patch(patch);
    return this.getState();
  }

  async saveGeminiApiKey(apiKey) {
    await this.settingsStore.patch({ geminiApiKey: String(apiKey ?? "").trim() });
    return this.getState();
  }

  async saveServiceToken(service, token) {
    const value = String(token ?? "").trim();
    const settings = await this.settingsStore.patch({
      tools: {
        [service]: {
          token: value
        }
      }
    });

    if (service === "notion") {
      const notionDir = path.join(os.homedir(), ".notion");
      await mkdir(notionDir, { recursive: true });
      await writeFile(path.join(notionDir, "credentials.json"), JSON.stringify({ token: value }, null, 2));
    }

    if (service === "slack") {
      const binaryPath = settings.tools.slack.binaryPath;
      if (!binaryPath || !await exists(binaryPath)) {
        throw new Error("Install Slack CLI before saving the Slack token.");
      }

      const probe = await runProbe(binaryPath, ["auth", "login", "--token", value], {
        SLACK_TOKEN: ""
      });
      if (!probe.ok) {
        throw new Error(`Slack auth failed. ${summarizeProbe(probe)}`);
      }
    }

    return this.getState();
  }

  async verifyTool(service) {
    const settings = await this.settingsStore.load();
    const state = await this.getState(settings);
    const toolState = state.tools[service];
    if (!toolState) {
      throw new Error(`Unsupported tool: ${service}`);
    }

    return toolState;
  }

  async getState(preloadedSettings = null) {
    const settings = preloadedSettings || await this.settingsStore.load();

    const slack = await this.inspectSlack(settings);
    const notion = await this.inspectNotion(settings);
    const apple = await this.inspectApple(settings);
    const anyToolReady = slack.ready || notion.ready || apple.ready;

    const phase = settings.geminiApiKey
      ? anyToolReady
        ? "complete"
        : "step_2_tools_setup"
      : "step_1_gemini_key";

    return {
      phase,
      settings: {
        geminiApiKey: settings.geminiApiKey,
        model: settings.model,
        thinkingLevel: settings.thinkingLevel,
        unsafeMode: settings.unsafeMode,
        slackCliPath: slack.binaryPath,
        notionCliPath: notion.binaryPath,
        appleCliPath: apple.binaryPath,
        slackToken: settings.tools.slack.token,
        notionToken: settings.tools.notion.token
      },
      gemini: {
        ready: Boolean(settings.geminiApiKey),
        detail: settings.geminiApiKey ? "Gemini API key is saved." : "Enter a Gemini API key to continue."
      },
      tools: {
        slack,
        notion,
        apple
      }
    };
  }

  async inspectSlack(settings) {
    const binaryPath = settings.tools.slack.binaryPath || this.installedBinaryPath("slack");
    const installed = await exists(binaryPath);
    const tokenPresent = Boolean(settings.tools.slack.token);
    const checkedAt = new Date().toISOString();

    if (!installed) {
      return {
        key: "slack",
        title: "Slack CLI",
        binaryPath: "",
        installed: false,
        authenticated: false,
        ready: false,
        status: "fail",
        checkedAt,
        detail: "Slack CLI is not installed yet.",
        learnMoreUrl: TOOL_METADATA.slack.learnMoreUrl,
        authUrl: TOOL_METADATA.slack.authUrl
      };
    }

    const authProbe = await runProbe(binaryPath, ["auth", "test"], {
      ...(tokenPresent ? { SLACK_TOKEN: settings.tools.slack.token } : {})
    });
    const authPayload = parseJson(authProbe.stdout);
    const verifiedDetail = authPayload?.ok
      ? `Slack CLI is installed and verified for ${authPayload.team || "your workspace"} as ${authPayload.user || "the current user"}.`
      : "Slack CLI is installed and authenticated.";

    return {
      key: "slack",
      title: "Slack CLI",
      binaryPath,
      installed: true,
      authenticated: authProbe.ok,
      ready: authProbe.ok,
      status: authProbe.ok ? "pass" : tokenPresent ? "warn" : "warn",
      checkedAt,
      detail: authProbe.ok
        ? verifiedDetail
        : tokenPresent
          ? `Slack token saved, but verification failed. ${summarizeProbe(authProbe)}`
          : "Install Slack CLI and paste a Slack user token to authenticate.",
      learnMoreUrl: TOOL_METADATA.slack.learnMoreUrl,
      authUrl: TOOL_METADATA.slack.authUrl
    };
  }

  async inspectNotion(settings) {
    const binaryPath = settings.tools.notion.binaryPath || this.installedBinaryPath("notion");
    const installed = await exists(binaryPath);
    const tokenPresent = Boolean(settings.tools.notion.token);
    const checkedAt = new Date().toISOString();

    if (!installed) {
      return {
        key: "notion",
        title: "Notion CLI",
        binaryPath: "",
        installed: false,
        authenticated: false,
        ready: false,
        status: "fail",
        checkedAt,
        detail: "Notion CLI is not installed yet.",
        learnMoreUrl: TOOL_METADATA.notion.learnMoreUrl,
        authUrl: TOOL_METADATA.notion.authUrl
      };
    }

    const authProbe = await runProbe(binaryPath, ["user", "me"], {
      ...(tokenPresent ? { NOTION_API_KEY: settings.tools.notion.token } : {})
    });
    const authPayload = parseJson(authProbe.stdout);
    const workspaceName = authPayload?.bot?.workspace_name;
    const integrationName = authPayload?.name;
    const verifiedDetail = workspaceName || integrationName
      ? `Notion CLI is installed and verified for ${workspaceName || "the connected workspace"} as ${integrationName || "the configured integration"}.`
      : "Notion CLI is installed and authenticated.";

    return {
      key: "notion",
      title: "Notion CLI",
      binaryPath,
      installed: true,
      authenticated: authProbe.ok,
      ready: authProbe.ok,
      status: authProbe.ok ? "pass" : tokenPresent ? "warn" : "warn",
      checkedAt,
      detail: authProbe.ok
        ? verifiedDetail
        : tokenPresent
          ? `Notion token saved, but verification failed. ${summarizeProbe(authProbe)}`
          : "Install Notion CLI and paste a Notion integration token.",
      learnMoreUrl: TOOL_METADATA.notion.learnMoreUrl,
      authUrl: TOOL_METADATA.notion.authUrl
    };
  }

  async inspectApple(settings) {
    const binaryPath = settings.tools.apple.binaryPath || this.installedBinaryPath("apple");
    const installed = await exists(binaryPath);
    const checkedAt = new Date().toISOString();

    if (!installed) {
      return {
        key: "apple",
        title: "Apple CLI",
        binaryPath: "",
        installed: false,
        authenticated: false,
        ready: false,
        status: "fail",
        checkedAt,
        detail: "Apple CLI is not installed yet.",
        learnMoreUrl: TOOL_METADATA.apple.learnMoreUrl
      };
    }

    const probe = await runProbe(binaryPath, ["reminders", "lists"]);
    const payload = parseJson(probe.stdout);
    const listCount = Array.isArray(payload) ? payload.length : null;
    const detail = probe.ok
      ? listCount === null
        ? "Apple CLI is installed and Automation access is available."
        : `Apple CLI is installed and Automation access is available. Reminders probe returned ${listCount} list${listCount === 1 ? "" : "s"}.`
      : summarizeProbe(probe);
    const permissionIssue = detail.includes("-10827")
      || detail.toLowerCase().includes("not authorized")
      || detail.toLowerCase().includes("not permitted")
      || detail.toLowerCase().includes("appleevent handler failed");

    return {
      key: "apple",
      title: "Apple CLI",
      binaryPath,
      installed: true,
      authenticated: probe.ok,
      ready: probe.ok,
      status: probe.ok ? "pass" : permissionIssue ? "warn" : "fail",
      checkedAt,
      detail: probe.ok
        ? detail
        : permissionIssue
          ? `Apple CLI is installed, but macOS Automation access is still required. ${detail}`
          : `Apple CLI verification failed. ${detail}`,
      learnMoreUrl: TOOL_METADATA.apple.learnMoreUrl
    };
  }
}
