import "dotenv/config";
import { app, BrowserWindow, globalShortcut, ipcMain, Menu, Tray, nativeImage, shell } from "electron";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AgentService } from "./live/agent-service.mjs";
import { OnboardingService } from "./runtime/onboarding-service.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_VOICE_SHORTCUT = process.platform === "darwin"
  ? "Command+Shift+Space"
  : "CommandOrControl+Shift+Space";

let mainWindow;
let agentService;
let onboardingService;
let tray;
let windowCloseInterceptEnabled = true;
let voiceListening = false;
let appIsQuitting = false;
let activeVoiceShortcut = DEFAULT_VOICE_SHORTCUT;
let registeredVoiceShortcut = "";
let nativeHotkeyHelper = null;
let nativeHotkeyHelperStopRequested = false;

function sendToRenderer(event, payload = {}) {
  if (!mainWindow?.isDestroyed()) {
    mainWindow.webContents.send(event, payload);
  }
}

function buildTrayIcon() {
  const image = nativeImage.createFromPath(
    path.join(__dirname, "tray", "LioStatusTemplate.png")
  );
  image.setTemplateImage(true);
  return image;
}

function showMainWindow() {
  if (!mainWindow) {
    return;
  }

  mainWindow.show();
  mainWindow.focus();
}

function hideMainWindow() {
  if (!mainWindow) {
    return;
  }

  mainWindow.hide();
}

function toggleVoiceFromBackground(source = "tray") {
  sendToRenderer("voice:toggle-request", {
    source,
    timestamp: new Date().toISOString()
  });
}

function logFromMain(level, message, extra = {}) {
  sendToRenderer("app:log", {
    level,
    message,
    extra,
    timestamp: new Date().toISOString()
  });
}

function normalizeVoiceShortcut(value) {
  const shortcut = String(value ?? "")
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const lowered = part.toLowerCase();
      if (lowered === "cmd") {
        return "Command";
      }
      if (lowered === "ctrl") {
        return "Control";
      }
      if (lowered === "opt" || lowered === "alt") {
        return "Option";
      }
      if (lowered === "fn" || lowered === "function" || lowered === "globe") {
        return "Fn";
      }
      if (lowered === "space") {
        return "Space";
      }
      return part.length === 1 ? part.toUpperCase() : part;
    })
    .join("+");
  return shortcut || DEFAULT_VOICE_SHORTCUT;
}

function handleVoiceShortcutTrigger(source = "global-shortcut") {
  showMainWindow();
  toggleVoiceFromBackground(source);
}

function usesNativeVoiceShortcut(shortcut) {
  return shortcut.split("+").some((part) => part.trim().toLowerCase() === "fn");
}

function resolveNativeHotkeyHelperPath() {
  const packagedPath = path.join(
    process.resourcesPath,
    "native",
    "macos-arm64",
    "LioHotkeyHelper.app",
    "Contents",
    "MacOS",
    "LioHotkeyHelper"
  );

  if (existsSync(packagedPath)) {
    return packagedPath;
  }

  return path.join(
    __dirname,
    "..",
    "assets",
    "native",
    "macos-arm64",
    "LioHotkeyHelper.app",
    "Contents",
    "MacOS",
    "LioHotkeyHelper"
  );
}

function tryRegisterVoiceShortcut(shortcut) {
  try {
    return globalShortcut.register(shortcut, () => {
      handleVoiceShortcutTrigger("global-shortcut");
    });
  } catch {
    return false;
  }
}

function getVoiceShortcutState() {
  return {
    accelerator: activeVoiceShortcut,
    defaultAccelerator: DEFAULT_VOICE_SHORTCUT,
    backend: usesNativeVoiceShortcut(activeVoiceShortcut) ? "native" : "electron"
  };
}

async function stopNativeVoiceHelper() {
  if (!nativeHotkeyHelper) {
    return;
  }

  const helper = nativeHotkeyHelper;
  nativeHotkeyHelperStopRequested = true;

  await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      helper.kill("SIGKILL");
    }, 1500);

    helper.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });

    helper.kill("SIGTERM");
  });

  nativeHotkeyHelper = null;
  nativeHotkeyHelperStopRequested = false;
}

function clearVoiceShortcutBackends() {
  if (registeredVoiceShortcut) {
    globalShortcut.unregister(registeredVoiceShortcut);
    registeredVoiceShortcut = "";
  }

  return stopNativeVoiceHelper();
}

async function startNativeVoiceHelper(shortcut) {
  const helperPath = resolveNativeHotkeyHelperPath();
  if (!existsSync(helperPath)) {
    throw new Error("Native Fn shortcut helper is not built. Run npm run build:native-helper.");
  }

  const helper = spawn(helperPath, ["--shortcut", shortcut, "--prompt-accessibility"], {
    stdio: ["ignore", "pipe", "pipe"]
  });

  nativeHotkeyHelper = helper;
  nativeHotkeyHelperStopRequested = false;

  await new Promise((resolve, reject) => {
    let settled = false;
    let stdoutBuffer = "";

    const settleReady = () => {
      if (settled) {
        return;
      }
      settled = true;
      resolve();
    };

    const settleError = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      reject(error);
    };

    const readyTimeout = setTimeout(() => {
      settleError(new Error("Native hotkey helper did not report ready state."));
    }, 4000);

    const cleanup = () => {
      clearTimeout(readyTimeout);
    };

    helper.stdout.on("data", (chunk) => {
      stdoutBuffer += chunk.toString();

      let newlineIndex = stdoutBuffer.indexOf("\n");
      while (newlineIndex >= 0) {
        const line = stdoutBuffer.slice(0, newlineIndex).trim();
        stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
        newlineIndex = stdoutBuffer.indexOf("\n");

        if (!line) {
          continue;
        }

        try {
          const message = JSON.parse(line);

          if (message.type === "ready") {
            logFromMain("info", "Native Fn shortcut helper ready", {
              shortcut: message.shortcut,
              accessibilityTrusted: Boolean(message.accessibilityTrusted)
            });
            cleanup();
            settleReady();
          } else if (message.type === "toggle") {
            handleVoiceShortcutTrigger("native-hotkey");
          } else if (message.type === "permission") {
            logFromMain("warn", "Native Fn shortcut permission needed", {
              kind: message.kind,
              status: message.status,
              message: message.message
            });
          } else if (message.type === "error") {
            cleanup();
            settleError(new Error(message.message || "Native hotkey helper failed."));
          }
        } catch (error) {
          cleanup();
          settleError(new Error(`Native hotkey helper returned invalid output. ${error.message}`));
        }
      }
    });

    helper.stderr.on("data", (chunk) => {
      logFromMain("warn", "Native hotkey helper stderr", {
        message: chunk.toString().trim()
      });
    });

    helper.once("exit", (code, signal) => {
      nativeHotkeyHelper = null;

      if (!settled) {
        cleanup();
        settleError(new Error(`Native hotkey helper exited early (${code ?? signal ?? "unknown"}).`));
        return;
      }

      if (!nativeHotkeyHelperStopRequested && !appIsQuitting) {
        logFromMain("warn", "Native hotkey helper exited", {
          code,
          signal
        });
      }
    });
  });
}

async function activateVoiceShortcutBackend(shortcut) {
  if (usesNativeVoiceShortcut(shortcut)) {
    await startNativeVoiceHelper(shortcut);
    return;
  }

  const registered = tryRegisterVoiceShortcut(shortcut);
  if (!registered) {
    throw new Error("Shortcut is unavailable. Try a different combination.");
  }

  registeredVoiceShortcut = shortcut;
}

async function applyVoiceShortcut(shortcut, { persist = true } = {}) {
  const nextShortcut = normalizeVoiceShortcut(shortcut);
  const previousShortcut = activeVoiceShortcut;

  await clearVoiceShortcutBackends();

  try {
    await activateVoiceShortcutBackend(nextShortcut);
    activeVoiceShortcut = nextShortcut;

    if (persist) {
      await onboardingService.settingsStore.patch({ voiceShortcut: nextShortcut });
    }

    return getVoiceShortcutState();
  } catch (error) {
    if (previousShortcut && previousShortcut !== nextShortcut) {
      try {
        await activateVoiceShortcutBackend(previousShortcut);
        activeVoiceShortcut = previousShortcut;
      } catch {
        // If rollback fails, leave the app without an active shortcut rather than masking the original error.
      }
    }

    throw error;
  }
}

async function initializeVoiceShortcut() {
  const settings = await onboardingService.settingsStore.load();
  const preferredShortcut = normalizeVoiceShortcut(settings.voiceShortcut);

  try {
    await applyVoiceShortcut(preferredShortcut, { persist: preferredShortcut !== settings.voiceShortcut });
  } catch (error) {
    logFromMain("warn", "Voice shortcut registration failed", {
      shortcut: preferredShortcut,
      message: error.message
    });
    await applyVoiceShortcut(DEFAULT_VOICE_SHORTCUT, { persist: true });
  }
}

async function requestAppQuit() {
  if (appIsQuitting) {
    return;
  }

  appIsQuitting = true;
  windowCloseInterceptEnabled = false;

  try {
    await agentService?.disconnect();
  } catch {
    // Ignore shutdown-time disconnect races.
  }

  if (tray) {
    tray.destroy();
    tray = null;
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.removeAllListeners("close");
    mainWindow.close();
  }

  app.quit();
}

function rebuildTrayMenu() {
  if (!tray) {
    return;
  }

  const contextMenu = Menu.buildFromTemplate([
    {
      label: mainWindow?.isVisible() ? "Hide Window" : "Show Window",
      click: () => {
        if (mainWindow?.isVisible()) {
          hideMainWindow();
        } else {
          showMainWindow();
        }
      }
    },
    {
      label: voiceListening ? "Stop Listening" : "Start Listening",
      click: () => toggleVoiceFromBackground("tray-menu")
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        void requestAppQuit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
  tray.setToolTip(voiceListening ? "Lio • listening" : "Lio");
}

function buildApplicationMenu() {
  const appName = app.name || "Lio";
  return Menu.buildFromTemplate([
    {
      label: appName,
      submenu: [
        {
          label: `Show ${appName}`,
          click: () => showMainWindow()
        },
        {
          label: mainWindow?.isVisible() ? "Hide Window" : "Hide App",
          click: () => hideMainWindow()
        },
        { type: "separator" },
        {
          label: `Quit ${appName}`,
          accelerator: "CommandOrControl+Q",
          click: () => {
            void requestAppQuit();
          }
        }
      ]
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "pasteAndMatchStyle" },
        { role: "delete" },
        { role: "selectAll" }
      ]
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        { type: "separator" },
        {
          label: "Show Window",
          click: () => showMainWindow()
        }
      ]
    }
  ]);
}

function setupTray() {
  tray = new Tray(buildTrayIcon());
  tray.on("click", () => {
    if (mainWindow?.isVisible()) {
      hideMainWindow();
    } else {
      showMainWindow();
    }
  });
  rebuildTrayMenu();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 760,
    backgroundColor: "#090b0d",
    ...(process.platform === "darwin"
      ? {
          titleBarStyle: "hiddenInset"
        }
      : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });

  agentService = new AgentService({
    send(event, payload) {
      sendToRenderer(event, payload);
    }
  });
  onboardingService = new OnboardingService({
    userDataDir: app.getPath("userData"),
    projectDir: path.join(__dirname, ".."),
    resourcesPath: process.resourcesPath
  });

  mainWindow.on("close", (event) => {
    if (windowCloseInterceptEnabled && !appIsQuitting) {
      event.preventDefault();
      hideMainWindow();
    }
  });

  mainWindow.on("show", rebuildTrayMenu);
  mainWindow.on("hide", rebuildTrayMenu);
  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
}

app.whenReady().then(() => {
  if (process.platform === "darwin") {
    if (typeof app.setActivationPolicy === "function") {
      app.setActivationPolicy("regular");
    }
    app.dock.show();
  }

  createWindow();
  setupTray();
  Menu.setApplicationMenu(buildApplicationMenu());
  void initializeVoiceShortcut();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      setupTray();
      Menu.setApplicationMenu(buildApplicationMenu());
    } else {
      showMainWindow();
    }
  });
});

app.on("before-quit", () => {
  appIsQuitting = true;
  windowCloseInterceptEnabled = false;
  globalShortcut.unregisterAll();
  void stopNativeVoiceHelper();
  if (tray) {
    tray.destroy();
    tray = null;
  }
});

app.on("window-all-closed", async () => {
  await agentService?.disconnect();
  if (process.platform !== "darwin" || appIsQuitting) {
    app.quit();
  }
});

ipcMain.handle("session:connect", async (_event, config) => {
  return agentService.connect(config);
});

ipcMain.handle("session:preflight", async (_event, config) => {
  return agentService.preflight(config);
});

ipcMain.handle("session:disconnect", async () => {
  return agentService.disconnect();
});

ipcMain.handle("session:send-text", async (_event, payload) => {
  return agentService.sendText(payload?.text ?? "");
});

ipcMain.handle("session:send-audio", async (_event, payload) => {
  return agentService.sendAudioChunk(payload);
});

ipcMain.handle("session:end-audio", async () => {
  return agentService.endAudioStream();
});

ipcMain.handle("onboarding:get-state", async () => {
  return onboardingService.getState();
});

ipcMain.handle("onboarding:save-gemini-key", async (_event, payload) => {
  return onboardingService.saveGeminiApiKey(payload?.apiKey ?? "");
});

ipcMain.handle("onboarding:install-tool", async (_event, payload) => {
  return onboardingService.installTool(payload?.service);
});

ipcMain.handle("onboarding:verify-tool", async (_event, payload) => {
  return onboardingService.verifyTool(payload?.service);
});

ipcMain.handle("onboarding:save-token", async (_event, payload) => {
  return onboardingService.saveServiceToken(payload?.service, payload?.token ?? "");
});

ipcMain.handle("app:open-external", async (_event, payload) => {
  const url = String(payload?.url ?? "").trim();
  if (!url) {
    throw new Error("Missing URL.");
  }

  await shell.openExternal(url);
  return { ok: true };
});

ipcMain.handle("app:show-window", async () => {
  showMainWindow();
  return { ok: true };
});

ipcMain.handle("app:hide-window", async () => {
  hideMainWindow();
  return { ok: true };
});

ipcMain.handle("voice:set-state", async (_event, payload) => {
  voiceListening = Boolean(payload?.listening);
  rebuildTrayMenu();
  return { ok: true };
});

ipcMain.handle("shortcut:get-voice", async () => {
  return getVoiceShortcutState();
});

ipcMain.handle("shortcut:set-voice", async (_event, payload) => {
  return applyVoiceShortcut(payload?.accelerator);
});

ipcMain.handle("shortcut:reset-voice", async () => {
  return applyVoiceShortcut(DEFAULT_VOICE_SHORTCUT);
});
