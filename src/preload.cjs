const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("geminiDesktop", {
  getOnboardingState: () => ipcRenderer.invoke("onboarding:get-state"),
  saveGeminiApiKey: (apiKey) => ipcRenderer.invoke("onboarding:save-gemini-key", { apiKey }),
  installTool: (service) => ipcRenderer.invoke("onboarding:install-tool", { service }),
  verifyTool: (service) => ipcRenderer.invoke("onboarding:verify-tool", { service }),
  saveServiceToken: (service, token) => ipcRenderer.invoke("onboarding:save-token", { service, token }),
  openExternal: (url) => ipcRenderer.invoke("app:open-external", { url }),
  connectSession: (config) => ipcRenderer.invoke("session:connect", config),
  runPreflight: (config) => ipcRenderer.invoke("session:preflight", config),
  disconnectSession: () => ipcRenderer.invoke("session:disconnect"),
  sendText: (text) => ipcRenderer.invoke("session:send-text", { text }),
  sendAudioChunk: (payload) => ipcRenderer.invoke("session:send-audio", payload),
  endAudioStream: () => ipcRenderer.invoke("session:end-audio"),
  showWindow: () => ipcRenderer.invoke("app:show-window"),
  hideWindow: () => ipcRenderer.invoke("app:hide-window"),
  setVoiceState: (listening) => ipcRenderer.invoke("voice:set-state", { listening }),
  getVoiceShortcut: () => ipcRenderer.invoke("shortcut:get-voice"),
  setVoiceShortcut: (accelerator) => ipcRenderer.invoke("shortcut:set-voice", { accelerator }),
  resetVoiceShortcut: () => ipcRenderer.invoke("shortcut:reset-voice"),
  onLog: (callback) => ipcRenderer.on("app:log", (_event, payload) => callback(payload)),
  onStatus: (callback) => ipcRenderer.on("app:status", (_event, payload) => callback(payload)),
  onTranscript: (callback) => ipcRenderer.on("live:transcript", (_event, payload) => callback(payload)),
  onModelAudio: (callback) => ipcRenderer.on("live:model-audio", (_event, payload) => callback(payload)),
  onInterruption: (callback) => ipcRenderer.on("live:interrupted", (_event, payload) => callback(payload)),
  onVoiceToggleRequest: (callback) => ipcRenderer.on("voice:toggle-request", (_event, payload) => callback(payload))
});
