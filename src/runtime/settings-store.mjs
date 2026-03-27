import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_SETTINGS = {
  version: 1,
  geminiApiKey: "",
  model: "gemini-3.1-flash-live-preview",
  thinkingLevel: "high",
  unsafeMode: true,
  voiceShortcut: process.platform === "darwin" ? "Command+Shift+Space" : "CommandOrControl+Shift+Space",
  tools: {
    slack: {
      binaryPath: "",
      token: ""
    },
    notion: {
      binaryPath: "",
      token: ""
    },
    apple: {
      binaryPath: ""
    }
  }
};

function mergeSettings(base, override) {
  return {
    ...base,
    ...override,
    tools: {
      ...base.tools,
      ...(override?.tools || {}),
      slack: {
        ...base.tools.slack,
        ...(override?.tools?.slack || {})
      },
      notion: {
        ...base.tools.notion,
        ...(override?.tools?.notion || {})
      },
      apple: {
        ...base.tools.apple,
        ...(override?.tools?.apple || {})
      }
    }
  };
}

export class SettingsStore {
  constructor(userDataDir) {
    this.userDataDir = userDataDir;
    this.settingsPath = path.join(userDataDir, "settings.json");
  }

  async ensureDir() {
    await mkdir(this.userDataDir, { recursive: true });
  }

  async load() {
    await this.ensureDir();

    try {
      const raw = await readFile(this.settingsPath, "utf8");
      return mergeSettings(DEFAULT_SETTINGS, JSON.parse(raw));
    } catch {
      return structuredClone(DEFAULT_SETTINGS);
    }
  }

  async save(nextSettings) {
    await this.ensureDir();
    const merged = mergeSettings(DEFAULT_SETTINGS, nextSettings);
    await writeFile(this.settingsPath, JSON.stringify(merged, null, 2));
    return merged;
  }

  async patch(partial) {
    const current = await this.load();
    const merged = mergeSettings(current, partial);
    return this.save(merged);
  }
}
