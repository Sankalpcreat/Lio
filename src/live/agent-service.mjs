import { GoogleGenAI, Modality, StartSensitivity, EndSensitivity } from "@google/genai";
import { access } from "node:fs/promises";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { executeFunctionCall, getToolDeclarations } from "./tool-registry.mjs";

const execFileAsync = promisify(execFile);

function now() {
  return new Date().toISOString();
}

function clip(value, maxLength = 4000) {
  const text = String(value ?? "");
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function homePath(...segments) {
  return `${os.homedir()}/${segments.join("/")}`;
}

function normalizeRuntimeConfig(config = {}) {
  const envUnsafeMode = String(process.env.UNSAFE_MODE ?? "true").toLowerCase();
  const unsafeModeDefault = envUnsafeMode !== "false" && envUnsafeMode !== "0";

  return {
    model: config.model || process.env.GEMINI_MODEL || "gemini-3.1-flash-live-preview",
    apiKey: config.apiKey || process.env.GEMINI_API_KEY || "",
    unsafeMode: typeof config.unsafeMode === "boolean" ? config.unsafeMode : unsafeModeDefault,
    slackCliPath: config.slackCliPath || process.env.SLACK_CLI_PATH || "",
    notionCliPath: config.notionCliPath || process.env.NOTION_CLI_PATH || "",
    appleCliPath: config.appleCliPath || process.env.APPLE_CLI_PATH || "",
    thinkingLevel: config.thinkingLevel || "high"
  };
}

function buildSystemInstruction(runtimeConfig) {
  return [
    "You are a live macOS desktop assistant with CLI tool access.",
    "When the user asks about Slack, Notion, Apple Notes, Reminders, Calendar, or Messages, use the CLI tools instead of answering from memory.",
    "Prefer the full-access tools slack_cli, notion_cli, and apple_cli.",
    "Slack supports the full command surface: api, auth, chat, conversations, files, users, search, reactions, reminders, pins, stars, dnd, team, usergroups, bookmarks, emoji, bots, workflows, calls, apps.",
    "Notion supports the full command surface: page, block, database, datasource, comment, user, search, file, oauth, token.",
    "Apple supports the full command surface: notes, reminders, calendar, messages.",
    "Pass the exact CLI arguments in the args array after the executable name.",
    "If identifiers are missing, first use a discovery or listing command to find them.",
    "For clear user requests to create, update, send, delete, or move, execute the necessary tool calls directly.",
    "After each tool call, summarize the result clearly.",
    `Full CLI access is ${runtimeConfig.unsafeMode ? "enabled" : "disabled"}.`
  ].join("\n");
}

async function fileExists(path) {
  if (!path) {
    return false;
  }

  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function runProbe(command, args, timeout = 15_000) {
  try {
    const result = await execFileAsync(command, args, {
      timeout,
      maxBuffer: 4 * 1024 * 1024,
      env: process.env
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
      message: error?.message ?? `Failed to run ${command}`
    };
  }
}

function summarizeProbe(probe) {
  return clip(probe.stderr || probe.stdout || probe.message || "", 800);
}

export class AgentService {
  constructor({ send }) {
    this.send = send;
    this.session = null;
    this.runtimeConfig = null;
  }

  log(level, message, extra = {}) {
    this.send("app:log", {
      level,
      message,
      extra,
      timestamp: now()
    });
  }

  status(kind, message, extra = {}) {
    this.send("app:status", {
      kind,
      message,
      extra,
      timestamp: now()
    });
  }

  async preflight(config) {
    const runtimeConfig = normalizeRuntimeConfig(config);
    const checks = [];

    const pushCheck = (status, name, detail, extra = {}) => {
      checks.push({ status, name, detail, ...extra });
    };

    if (runtimeConfig.apiKey) {
      pushCheck("pass", "Gemini API key", "Gemini API key is present.");
    } else {
      pushCheck("warn", "Gemini API key", "Gemini API key is missing. Live session connect will fail until it is set.");
    }

    const slackBinaryExists = await fileExists(runtimeConfig.slackCliPath);
    if (slackBinaryExists) {
      pushCheck("pass", "Slack CLI binary", `Found Slack CLI at ${runtimeConfig.slackCliPath}.`);
    } else {
      pushCheck("fail", "Slack CLI binary", "Slack CLI binary path is missing or invalid.");
    }

    const slackCredentialPath = homePath(".slack", "credentials.json");
    const slackCredentialPresent =
      Boolean(process.env.SLACK_TOKEN) || await fileExists(slackCredentialPath);
    if (!slackCredentialPresent) {
      pushCheck("warn", "Slack auth", "No Slack token detected. Set SLACK_TOKEN or run slack-cli auth login.");
    } else if (slackBinaryExists) {
      const probe = await runProbe(runtimeConfig.slackCliPath, ["auth", "test"]);
      if (probe.ok) {
        pushCheck("pass", "Slack auth", "Slack auth test succeeded.");
      } else {
        pushCheck("fail", "Slack auth", `Slack auth test failed. ${summarizeProbe(probe)}`);
      }
    }

    const notionBinaryExists = await fileExists(runtimeConfig.notionCliPath);
    if (notionBinaryExists) {
      pushCheck("pass", "Notion CLI binary", `Found Notion CLI at ${runtimeConfig.notionCliPath}.`);
    } else {
      pushCheck("fail", "Notion CLI binary", "Notion CLI binary path is missing or invalid.");
    }

    const notionCredentialPath = homePath(".notion", "credentials.json");
    const notionCredentialPresent =
      Boolean(process.env.NOTION_API_KEY || process.env.NOTION_TOKEN) || await fileExists(notionCredentialPath);
    if (!notionCredentialPresent) {
      pushCheck("warn", "Notion auth", "No Notion token detected. Set NOTION_API_KEY, NOTION_TOKEN, or ~/.notion/credentials.json.");
    } else if (notionBinaryExists) {
      const probe = await runProbe(runtimeConfig.notionCliPath, ["user", "me"]);
      if (probe.ok) {
        pushCheck("pass", "Notion auth", "Notion user probe succeeded.");
      } else {
        const message = summarizeProbe(probe);
        pushCheck("fail", "Notion auth", `Notion user probe failed. ${message}`);
      }
    }

    const appleBinaryExists = await fileExists(runtimeConfig.appleCliPath);
    if (appleBinaryExists) {
      pushCheck("pass", "Apple CLI binary", `Found Apple CLI at ${runtimeConfig.appleCliPath}.`);
    } else {
      pushCheck("fail", "Apple CLI binary", "Apple CLI binary path is missing or invalid.");
    }

    if (appleBinaryExists) {
      const probe = await runProbe(runtimeConfig.appleCliPath, ["reminders", "lists"]);
      if (probe.ok) {
        pushCheck("pass", "Apple automation", "Apple CLI reminders probe succeeded.");
      } else {
        const message = summarizeProbe(probe);
        if (
          message.includes("-10827") ||
          message.toLowerCase().includes("appleevent handler failed") ||
          message.toLowerCase().includes("not authorized") ||
          message.toLowerCase().includes("not permitted")
        ) {
          pushCheck("warn", "Apple automation", `Apple automation permission is not granted yet. ${message}`);
        } else {
          pushCheck("fail", "Apple automation", `Apple CLI reminders probe failed. ${message}`);
        }
      }
    }

    const summary = {
      pass: checks.filter((check) => check.status === "pass").length,
      warn: checks.filter((check) => check.status === "warn").length,
      fail: checks.filter((check) => check.status === "fail").length
    };

    return {
      ok: summary.fail === 0,
      checks,
      summary,
      runtimeConfig: {
        model: runtimeConfig.model,
        slackCliPath: runtimeConfig.slackCliPath,
        notionCliPath: runtimeConfig.notionCliPath,
        appleCliPath: runtimeConfig.appleCliPath
      }
    };
  }

  async connect(config) {
    await this.disconnect();

    this.runtimeConfig = normalizeRuntimeConfig(config);

    if (!this.runtimeConfig.apiKey) {
      throw new Error("A Gemini API key is required.");
    }

    const preflight = await this.preflight(this.runtimeConfig);
    for (const check of preflight.checks) {
      this.log(check.status === "fail" ? "error" : check.status === "warn" ? "warn" : "info", check.name, {
        detail: check.detail
      });
    }

    const ai = new GoogleGenAI({ apiKey: this.runtimeConfig.apiKey });

    const liveConfig = {
      responseModalities: [Modality.AUDIO],
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      realtimeInputConfig: {
        automaticActivityDetection: {
          disabled: false,
          startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_LOW,
          endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_LOW,
          prefixPaddingMs: 40,
          silenceDurationMs: 600
        }
      },
      thinkingConfig: {
        thinkingLevel: this.runtimeConfig.thinkingLevel
      },
      systemInstruction: buildSystemInstruction(this.runtimeConfig),
      sessionResumption: {},
      contextWindowCompression: {
        slidingWindow: {}
      },
      tools: [
        {
          functionDeclarations: getToolDeclarations()
        }
      ]
    };

    this.log("info", "Connecting to Gemini Live session", {
      model: this.runtimeConfig.model,
      unsafeMode: this.runtimeConfig.unsafeMode
    });

    this.session = await ai.live.connect({
      model: this.runtimeConfig.model,
      config: liveConfig,
      callbacks: {
        onopen: () => {
          this.status("connected", "Gemini Live session connected");
        },
        onclose: (event) => {
          this.status("closed", "Gemini Live session closed", {
            reason: event?.reason ?? ""
          });
          this.session = null;
        },
        onerror: (event) => {
          this.log("error", "Gemini Live error", {
            message: event?.message ?? String(event)
          });
        },
        onmessage: (message) => {
          void this.handleMessage(message);
        }
      }
    });

    return {
      ok: true,
      model: this.runtimeConfig.model,
      preflight
    };
  }

  async disconnect() {
    if (this.session) {
      try {
        await this.endAudioStream();
        this.session.close();
      } catch {
        // Ignore close failures during shutdown.
      }
      this.session = null;
    }

    this.status("idle", "Session disconnected");
    return { ok: true };
  }

  async sendText(text) {
    if (!this.session) {
      throw new Error("No active Gemini Live session.");
    }

    const trimmed = String(text ?? "").trim();
    if (!trimmed) {
      return { ok: true };
    }

    await this.session.sendRealtimeInput({ text: trimmed });
    this.send("live:transcript", {
      role: "user",
      text: trimmed,
      timestamp: now()
    });

    return { ok: true };
  }

  async sendAudioChunk(payload) {
    if (!this.session) {
      throw new Error("No active Gemini Live session.");
    }

    const base64Data = String(payload?.base64Data ?? "");
    const sampleRate = Number(payload?.sampleRate ?? 16000);

    if (!base64Data) {
      return { ok: true };
    }

    await this.session.sendRealtimeInput({
      audio: {
        data: base64Data,
        mimeType: `audio/pcm;rate=${sampleRate}`
      }
    });

    return { ok: true };
  }

  async endAudioStream() {
    if (!this.session) {
      return { ok: true };
    }

    await this.session.sendRealtimeInput({
      audioStreamEnd: true
    });

    return { ok: true };
  }

  async handleMessage(message) {
    if (!message) {
      return;
    }

    if (message.toolCall?.functionCalls?.length) {
      await this.handleToolCalls(message.toolCall.functionCalls);
    }

    if (message.serverContent?.inputTranscription?.text) {
      this.send("live:transcript", {
        role: "user",
        text: message.serverContent.inputTranscription.text,
        timestamp: now()
      });
    }

    if (message.serverContent?.outputTranscription?.text) {
      this.send("live:transcript", {
        role: "model",
        text: message.serverContent.outputTranscription.text,
        timestamp: now()
      });
    }

    if (message.serverContent?.interrupted) {
      this.send("live:interrupted", {
        timestamp: now()
      });
    }

    if (message.serverContent?.turnComplete) {
      this.log("debug", "Live turn complete");
    }

    if (message.goAway?.timeLeft) {
      this.log("warn", "Live session received GoAway", {
        timeLeft: message.goAway.timeLeft
      });
    }

    if (message.sessionResumptionUpdate?.newHandle) {
      this.log("info", "Received session resumption handle", {
        resumable: message.sessionResumptionUpdate.resumable
      });
    }

    const parts = message.serverContent?.modelTurn?.parts ?? [];
    for (const part of parts) {
      if (part.inlineData?.data) {
        this.send("live:model-audio", {
          mimeType: part.inlineData.mimeType ?? "audio/pcm;rate=24000",
          base64Data: part.inlineData.data,
          timestamp: now()
        });
      }

      if (part.text) {
        this.log("debug", "Model text part", {
          text: clip(part.text, 1200)
        });
      }

      if (part.executableCode?.code) {
        this.log("debug", "Model generated executable code", {
          code: clip(part.executableCode.code, 1200)
        });
      }

      if (part.codeExecutionResult?.output) {
        this.log("debug", "Model code execution result", {
          output: clip(part.codeExecutionResult.output, 1200)
        });
      }
    }
  }

  async handleToolCalls(functionCalls) {
    if (!this.session) {
      return;
    }

    const functionResponses = [];

    for (const functionCall of functionCalls) {
      this.log("info", "Executing tool call", {
        name: functionCall.name,
        args: functionCall.args
      });

      const result = await executeFunctionCall(functionCall, this.runtimeConfig);
      functionResponses.push({
        id: functionCall.id,
        name: functionCall.name,
        response: result
      });

      this.log(result.ok ? "info" : "warn", "Tool call completed", {
        name: functionCall.name,
        result: clip(JSON.stringify(result), 2000)
      });
    }

    await this.session.sendToolResponse({ functionResponses });
  }
}
