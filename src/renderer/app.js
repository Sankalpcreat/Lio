const elements = {
  onboardingShell: document.querySelector("#onboardingShell"),
  workspaceShell: document.querySelector("#workspaceShell"),
  stepOne: document.querySelector("#stepOne"),
  stepTwo: document.querySelector("#stepTwo"),
  onboardingApiKey: document.querySelector("#onboardingApiKey"),
  stepPillOne: document.querySelector("#stepPillOne"),
  stepPillTwo: document.querySelector("#stepPillTwo"),
  stepOneHint: document.querySelector("#stepOneHint"),
  stepOneContinueButton: document.querySelector("#stepOneContinueButton"),
  backToStepOneButton: document.querySelector("#backToStepOneButton"),
  returnToWorkspaceButton: document.querySelector("#returnToWorkspaceButton"),
  workspaceSetupChecklist: document.querySelector("#workspaceSetupChecklist"),
  guideModal: document.querySelector("#guideModal"),
  guideModalBackdrop: document.querySelector("#guideModalBackdrop"),
  guideCloseButton: document.querySelector("#guideCloseButton"),
  guideEyebrow: document.querySelector("#guideEyebrow"),
  guideTitle: document.querySelector("#guideTitle"),
  guideIntro: document.querySelector("#guideIntro"),
  guideSteps: document.querySelector("#guideSteps"),
  guideLinks: document.querySelector("#guideLinks"),
  slackStatusChip: document.querySelector("#slackStatusChip"),
  notionStatusChip: document.querySelector("#notionStatusChip"),
  appleStatusChip: document.querySelector("#appleStatusChip"),
  slackStatusDetail: document.querySelector("#slackStatusDetail"),
  notionStatusDetail: document.querySelector("#notionStatusDetail"),
  appleStatusDetail: document.querySelector("#appleStatusDetail"),
  slackInstallState: document.querySelector("#slackInstallState"),
  notionInstallState: document.querySelector("#notionInstallState"),
  appleInstallState: document.querySelector("#appleInstallState"),
  slackAuthState: document.querySelector("#slackAuthState"),
  notionAuthState: document.querySelector("#notionAuthState"),
  appleAuthState: document.querySelector("#appleAuthState"),
  slackVerifyState: document.querySelector("#slackVerifyState"),
  notionVerifyState: document.querySelector("#notionVerifyState"),
  appleVerifyState: document.querySelector("#appleVerifyState"),
  slackStateMeta: document.querySelector("#slackStateMeta"),
  notionStateMeta: document.querySelector("#notionStateMeta"),
  appleStateMeta: document.querySelector("#appleStateMeta"),
  slackActionNote: document.querySelector("#slackActionNote"),
  notionActionNote: document.querySelector("#notionActionNote"),
  appleActionNote: document.querySelector("#appleActionNote"),
  slackTokenInput: document.querySelector("#slackTokenInput"),
  notionTokenInput: document.querySelector("#notionTokenInput"),
  editSetupButton: document.querySelector("#editSetupButton"),
  shortcutButton: document.querySelector("#shortcutButton"),
  checksButton: document.querySelector("#checksButton"),
  connectButton: document.querySelector("#connectButton"),
  disconnectButton: document.querySelector("#disconnectButton"),
  micButton: document.querySelector("#micButton"),
  clearLogsButton: document.querySelector("#clearLogsButton"),
  statusBadge: document.querySelector("#statusBadge"),
  textForm: document.querySelector("#textForm"),
  textInput: document.querySelector("#textInput"),
  transcript: document.querySelector("#transcript"),
  logs: document.querySelector("#logs"),
  shortcutModal: document.querySelector("#shortcutModal"),
  shortcutModalBackdrop: document.querySelector("#shortcutModalBackdrop"),
  shortcutCloseButton: document.querySelector("#shortcutCloseButton"),
  shortcutCurrentValue: document.querySelector("#shortcutCurrentValue"),
  shortcutCaptureButton: document.querySelector("#shortcutCaptureButton"),
  shortcutCaptureHint: document.querySelector("#shortcutCaptureHint"),
  shortcutSaveButton: document.querySelector("#shortcutSaveButton"),
  shortcutResetButton: document.querySelector("#shortcutResetButton"),
  shortcutPresetFnButton: document.querySelector("#shortcutPresetFnButton"),
  shortcutPresetFnSpaceButton: document.querySelector("#shortcutPresetFnSpaceButton")
};

const desktopApi = window.geminiDesktop;
const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
const SHORTCUT_HINT = "Use Command, Control, Option, Shift, letters, numbers, function keys, or Space.";

let audioContext;
let microphoneStream;
let processorNode;
let micEnabled = false;
let sessionConnected = false;
let connectRequest = null;
let audioSendFailureActive = false;
let playbackContext;
let nextPlaybackTime = 0;
const activeSources = new Set();
let lastTranscriptEntry = null;
let transcriptTurnCounter = 0;
let onboardingState = null;
let setupViewForcedOpen = false;
const serviceActionState = {
  slack: null,
  notion: null,
  apple: null
};
let activeGuide = null;
let shortcutState = null;
let shortcutDraft = "";
let shortcutRecording = false;

const GUIDE_CONTENT = {
  slack: {
    eyebrow: "Slack Setup",
    title: "How to set up Slack CLI",
    intro: "Slack needs a user token, not just the bundled binary. The easiest path for a new user is to create a Slack app manually, install it, then paste the User OAuth token into Lio.",
    steps: [
      {
        title: "Open Slack app creation",
        copy: "Go to the Slack apps page and choose Create New App, then From scratch. Pick the workspace where the user wants Lio to operate."
      },
      {
        title: "Add user token scopes",
        copy: "Open OAuth & Permissions and add the user scopes the CLI needs. Minimum practical set from the repo is channels:read, channels:write, chat:write, users:read, files:read, files:write, groups:read, groups:write, and links:write."
      },
      {
        title: "Install to the workspace",
        copy: "Use Install to Workspace, approve the app, then copy the User OAuth Token. It should start with xoxp-. Do not use the bot token here."
      },
      {
        title: "Paste the token into Lio",
        copy: "Return to Lio, paste the xoxp token into Slack User Token, click Save Token, then click Verify. Lio saves it in the same Slack-compatible credential format the CLI expects."
      }
    ],
    links: [
      { label: "Open Slack Apps", url: "https://api.slack.com/apps" },
      { label: "View Slack CLI Repo", url: "https://github.com/Sankalpcreat/Slack-Cli" }
    ]
  },
  notion: {
    eyebrow: "Notion Setup",
    title: "How to set up Notion CLI",
    intro: "Notion is simpler than Slack. The user needs an internal integration secret, then they need to share the relevant pages or databases with that integration before verifying in Lio.",
    steps: [
      {
        title: "Create an internal integration",
        copy: "Open the Notion integrations page and create a new internal integration inside the user’s workspace."
      },
      {
        title: "Copy the integration secret",
        copy: "After creation, copy the internal integration secret. This is the token Lio needs. It is the same token the Notion CLI accepts through NOTION_API_KEY or the local credentials file."
      },
      {
        title: "Share content with the integration",
        copy: "In Notion, open the page or database the user wants Lio to access, then use Share or Connections to add the integration. Without this, verify may succeed for the account but content reads will fail."
      },
      {
        title: "Paste into Lio and verify",
        copy: "Return to Lio, paste the secret into Notion Token, click Save Token, then click Verify. Lio writes the local compatible credential file and runs a live user me check."
      }
    ],
    links: [
      { label: "Open Notion Integrations", url: "https://www.notion.so/profile/integrations" },
      { label: "View Notion CLI Repo", url: "https://github.com/Sankalpcreat/Notion-CLI" }
    ]
  }
};

function appendEntry(container, { kind, title, text, timestamp, extra = "" }) {
  const wrapper = document.createElement("article");
  wrapper.className = `entry ${kind}`;

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.innerHTML = `<span>${title}</span><span>${new Date(timestamp).toLocaleTimeString()}</span>`;

  const body = document.createElement(container === elements.logs ? "pre" : "div");
  body.textContent = extra ? `${text}\n${extra}` : text;

  wrapper.append(meta, body);
  container.prepend(wrapper);
}

function appendTranscriptLine({ role, text, timestamp }) {
  const normalizedRole = role === "model" ? "model" : "user";
  const cleanedText = String(text ?? "").trim();
  if (!cleanedText) {
    return;
  }

  const sameRole = lastTranscriptEntry?.role === normalizedRole;
  if (sameRole) {
    const previousText = lastTranscriptEntry.text;
    if (cleanedText === previousText || previousText.endsWith(cleanedText)) {
      return;
    }

    const mergedText = cleanedText.startsWith(previousText)
      ? cleanedText
      : `${previousText}\n${cleanedText}`;

    lastTranscriptEntry.text = mergedText;
    lastTranscriptEntry.body.textContent = mergedText;
    lastTranscriptEntry.time.textContent = new Date(timestamp).toLocaleTimeString();
    elements.transcript.scrollTop = elements.transcript.scrollHeight;
    return;
  }

  transcriptTurnCounter += 1;

  const wrapper = document.createElement("article");
  wrapper.className = `entry transcript-line ${normalizedRole}`;

  const meta = document.createElement("div");
  meta.className = "meta";

  const title = document.createElement("span");
  title.textContent = `${transcriptTurnCounter}. ${normalizedRole === "user" ? "You" : "Gemini"}`;

  const time = document.createElement("span");
  time.textContent = new Date(timestamp).toLocaleTimeString();

  meta.append(title, time);

  const body = document.createElement("div");
  body.className = "transcript-text";
  body.textContent = cleanedText;

  wrapper.append(meta, body);
  elements.transcript.append(wrapper);
  elements.transcript.scrollTop = elements.transcript.scrollHeight;

  lastTranscriptEntry = {
    role: normalizedRole,
    text: cleanedText,
    body,
    time
  };
}

function formatTime(timestamp) {
  if (!timestamp) {
    return "Not yet";
  }

  return new Date(timestamp).toLocaleTimeString();
}

function setServiceAction(service, kind, text, timestamp = new Date().toISOString()) {
  serviceActionState[service] = { kind, text, timestamp };
}

function appendSetupActivity({ kind, title, text, timestamp }) {
  void kind;
  void title;
  void text;
  void timestamp;
}

function closeGuideModal() {
  activeGuide = null;
  elements.guideModal.classList.add("hidden");
  elements.guideModal.setAttribute("aria-hidden", "true");
}

function openGuideModal(guideKey) {
  const guide = GUIDE_CONTENT[guideKey];
  if (!guide) {
    return;
  }

  activeGuide = guideKey;
  elements.guideEyebrow.textContent = guide.eyebrow;
  elements.guideTitle.textContent = guide.title;
  elements.guideIntro.textContent = guide.intro;
  elements.guideSteps.innerHTML = "";
  elements.guideLinks.innerHTML = "";

  for (const step of guide.steps) {
    const item = document.createElement("li");
    item.innerHTML = `
      <div>
        <span class="guide-step-title">${step.title}</span>
        <div class="guide-step-copy">${step.copy}</div>
      </div>
    `;
    elements.guideSteps.append(item);
  }

  for (const link of guide.links) {
    const button = document.createElement("button");
    button.className = "tertiary";
    button.textContent = link.label;
    button.dataset.openUrl = link.url;
    button.addEventListener("click", async () => {
      try {
        await requireDesktopApi().openExternal(link.url);
      } catch (error) {
        appendEntry(elements.logs, {
          kind: "error",
          title: "open link",
          text: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });
    elements.guideLinks.append(button);
  }

  elements.guideModal.classList.remove("hidden");
  elements.guideModal.setAttribute("aria-hidden", "false");
}

function formatShortcutForDisplay(accelerator) {
  return String(accelerator ?? "")
    .split("+")
    .filter(Boolean)
    .map((part) => {
      switch (part) {
        case "CommandOrControl":
          return "Cmd/Ctrl";
        case "Command":
          return "Cmd";
        case "Control":
          return "Ctrl";
        case "Option":
          return "Opt";
        case "Shift":
          return "Shift";
        case "Space":
          return "Space";
        case "Return":
          return "Return";
        case "Escape":
          return "Esc";
        case "PageUp":
          return "PgUp";
        case "PageDown":
          return "PgDn";
        default:
          return part.length === 1 ? part.toUpperCase() : part;
      }
    })
    .join(" + ");
}

function setSessionConnected(nextValue) {
  sessionConnected = Boolean(nextValue);
  elements.connectButton.disabled = sessionConnected;
  elements.connectButton.textContent = sessionConnected ? "Connected" : "Connect";
  elements.disconnectButton.disabled = !sessionConnected;
}

function updateShortcutCapturePresentation({ label, hint = SHORTCUT_HINT, tone = "" }) {
  elements.shortcutCaptureButton.textContent = label;
  elements.shortcutCaptureHint.textContent = hint;
  elements.shortcutCaptureHint.classList.remove("pass", "warn", "fail");
  if (tone) {
    elements.shortcutCaptureHint.classList.add(tone);
  }
  elements.shortcutSaveButton.disabled = !shortcutDraft || shortcutDraft === shortcutState?.accelerator;
}

function renderShortcutState() {
  if (!shortcutState) {
    return;
  }

  elements.shortcutCurrentValue.textContent = formatShortcutForDisplay(shortcutState.accelerator);

  if (shortcutRecording) {
    return;
  }

  if (shortcutDraft) {
    updateShortcutCapturePresentation({
      label: formatShortcutForDisplay(shortcutDraft),
      hint: "Save this shortcut to make it active everywhere.",
      tone: "pass"
    });
    return;
  }

  updateShortcutCapturePresentation({
    label: "Press a new shortcut",
    hint: SHORTCUT_HINT
  });
}

function closeShortcutModal() {
  shortcutRecording = false;
  shortcutDraft = "";
  elements.shortcutModal.classList.add("hidden");
  elements.shortcutModal.setAttribute("aria-hidden", "true");
  elements.shortcutCaptureButton.classList.remove("is-recording");
  renderShortcutState();
}

async function loadVoiceShortcutState() {
  shortcutState = await requireDesktopApi().getVoiceShortcut();
  renderShortcutState();
  return shortcutState;
}

function openShortcutModal() {
  if (!shortcutState) {
    return;
  }

  shortcutDraft = "";
  shortcutRecording = false;
  elements.shortcutCaptureButton.classList.remove("is-recording");
  renderShortcutState();
  elements.shortcutModal.classList.remove("hidden");
  elements.shortcutModal.setAttribute("aria-hidden", "false");
}

function beginShortcutRecording() {
  shortcutRecording = true;
  shortcutDraft = "";
  elements.shortcutCaptureButton.classList.add("is-recording");
  updateShortcutCapturePresentation({
    label: "Listening for keys...",
    hint: "Press the full shortcut now. Fn-only shortcuts are not available in this build.",
    tone: "warn"
  });
}

function chooseShortcutPreset(accelerator) {
  shortcutRecording = false;
  shortcutDraft = accelerator;
  elements.shortcutCaptureButton.classList.remove("is-recording");
  updateShortcutCapturePresentation({
    label: formatShortcutForDisplay(accelerator),
    hint: accelerator.startsWith("Fn")
      ? "Fn shortcuts use the native macOS helper and may ask for Accessibility permission."
      : "Save this shortcut to make it active everywhere.",
    tone: accelerator.startsWith("Fn") ? "warn" : "pass"
  });
}

function acceleratorKeyFromEvent(event) {
  const key = String(event.key ?? "");

  if (!key || key === "Meta" || key === "Control" || key === "Alt" || key === "Shift" || key === "Fn") {
    return "";
  }

  if (key === " ") {
    return "Space";
  }

  if (/^F([1-9]|1[0-9]|2[0-4])$/i.test(key)) {
    return key.toUpperCase();
  }

  if (key.length === 1) {
    const upper = key.toUpperCase();
    if (/[A-Z0-9]/.test(upper)) {
      return upper;
    }
  }

  const aliases = {
    ArrowUp: "Up",
    ArrowDown: "Down",
    ArrowLeft: "Left",
    ArrowRight: "Right",
    Enter: "Return",
    Escape: "Escape",
    Backspace: "Backspace",
    Delete: "Delete",
    Tab: "Tab",
    Home: "Home",
    End: "End",
    PageUp: "PageUp",
    PageDown: "PageDown"
  };

  return aliases[key] || "";
}

function shortcutFromKeyboardEvent(event) {
  const parts = [];

  if (event.metaKey) {
    parts.push(isMac ? "Command" : "Super");
  }
  if (event.ctrlKey) {
    parts.push("Control");
  }
  if (event.altKey) {
    parts.push("Option");
  }
  if (event.shiftKey) {
    parts.push("Shift");
  }

  const key = acceleratorKeyFromEvent(event);
  if (!key) {
    return { error: "Press at least one non-modifier key." };
  }

  if (!parts.length && !/^F([1-9]|1[0-9]|2[0-4])$/.test(key)) {
    return { error: "Use at least one modifier key or a function key." };
  }

  return {
    accelerator: [...parts, key].join("+")
  };
}

function requireDesktopApi() {
  if (!desktopApi) {
    throw new Error("Electron preload bridge is unavailable. Restart the app after the preload fix.");
  }

  return desktopApi;
}

function setStatus(text) {
  elements.statusBadge.textContent = text;
  elements.statusBadge.classList.remove("listening", "error", "checks");

  const normalized = String(text ?? "").toLowerCase();
  if (normalized.includes("listening")) {
    elements.statusBadge.classList.add("listening");
  } else if (normalized.includes("error") || normalized.includes("fail")) {
    elements.statusBadge.classList.add("error");
  } else if (normalized.startsWith("checks:")) {
    elements.statusBadge.classList.add("checks");
  }
}

function floatTo16BitPCM(float32Array) {
  const pcm = new Int16Array(float32Array.length);
  for (let index = 0; index < float32Array.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, float32Array[index]));
    pcm[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return pcm;
}

function downsample(input, inputRate, outputRate) {
  if (outputRate >= inputRate) {
    return input;
  }

  const ratio = inputRate / outputRate;
  const newLength = Math.round(input.length / ratio);
  const output = new Float32Array(newLength);

  let offsetResult = 0;
  let offsetBuffer = 0;

  while (offsetResult < output.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
    let accumulator = 0;
    let count = 0;

    for (let index = offsetBuffer; index < nextOffsetBuffer && index < input.length; index += 1) {
      accumulator += input[index];
      count += 1;
    }

    output[offsetResult] = accumulator / Math.max(count, 1);
    offsetResult += 1;
    offsetBuffer = nextOffsetBuffer;
  }

  return output;
}

function base64FromInt16(pcm) {
  const bytes = new Uint8Array(pcm.buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const slice = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

function int16FromBase64(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Int16Array(bytes.buffer);
}

async function playPcm16(base64Data, sampleRate = 24000) {
  if (!playbackContext) {
    playbackContext = new AudioContext();
  }

  if (playbackContext.state === "suspended") {
    await playbackContext.resume();
  }

  const pcm = int16FromBase64(base64Data);
  const buffer = playbackContext.createBuffer(1, pcm.length, sampleRate);
  const channel = buffer.getChannelData(0);

  for (let index = 0; index < pcm.length; index += 1) {
    channel[index] = pcm[index] / 0x7fff;
  }

  const source = playbackContext.createBufferSource();
  source.buffer = buffer;
  source.connect(playbackContext.destination);

  const startAt = Math.max(playbackContext.currentTime, nextPlaybackTime);
  source.start(startAt);
  nextPlaybackTime = startAt + buffer.duration;
  activeSources.add(source);
  source.onended = () => activeSources.delete(source);
}

function stopPlayback() {
  for (const source of activeSources) {
    try {
      source.stop();
    } catch {
      // Ignore race conditions during playback cancellation.
    }
  }
  activeSources.clear();
  if (playbackContext) {
    nextPlaybackTime = playbackContext.currentTime;
  } else {
    nextPlaybackTime = 0;
  }
}

function runtimeConfigFromState() {
  if (!onboardingState) {
    throw new Error("Onboarding state is not loaded yet.");
  }

  return {
    apiKey: onboardingState.settings.geminiApiKey,
    model: onboardingState.settings.model,
    thinkingLevel: onboardingState.settings.thinkingLevel,
    slackCliPath: onboardingState.settings.slackCliPath,
    notionCliPath: onboardingState.settings.notionCliPath,
    appleCliPath: onboardingState.settings.appleCliPath,
    unsafeMode: onboardingState.settings.unsafeMode
  };
}

async function ensureSessionConnected(source = "workspace") {
  if (sessionConnected) {
    return { ok: true, reused: true };
  }

  if (connectRequest) {
    return connectRequest;
  }

  setStatus("connecting");

  connectRequest = (async () => {
    const result = await requireDesktopApi().connectSession(runtimeConfigFromState());
    setSessionConnected(true);
    return result;
  })();

  try {
    return await connectRequest;
  } catch (error) {
    setSessionConnected(false);
    appendEntry(elements.logs, {
      kind: "error",
      title: `${source} connect error`,
      text: error.message,
      timestamp: new Date().toISOString()
    });
    throw error;
  } finally {
    connectRequest = null;
  }
}

async function startMicrophone({ skipConnect = false, source = "workspace" } = {}) {
  if (micEnabled) {
    return;
  }

  try {
    setStatus("opening microphone");
    microphoneStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
    audioContext = new AudioContext();
    await audioContext.resume();
    const sourceNode = audioContext.createMediaStreamSource(microphoneStream);
    processorNode = audioContext.createScriptProcessor(4096, 1, 1);
    audioSendFailureActive = false;

    processorNode.onaudioprocess = (event) => {
      if (!micEnabled || audioSendFailureActive) {
        return;
      }

      const inputData = event.inputBuffer.getChannelData(0);
      const downsampled = downsample(inputData, audioContext.sampleRate, 16000);
      const pcm = floatTo16BitPCM(downsampled);
      const base64Data = base64FromInt16(pcm);
      void requireDesktopApi().sendAudioChunk({
        base64Data,
        sampleRate: 16000
      }).catch(async (error) => {
        if (audioSendFailureActive) {
          return;
        }

        audioSendFailureActive = true;
        appendEntry(elements.logs, {
          kind: "error",
          title: "microphone stream error",
          text: error.message,
          timestamp: new Date().toISOString()
        });
        await stopMicrophone({ updateStatus: false });
        setStatus("listen error");
      });
    };

    sourceNode.connect(processorNode);
    processorNode.connect(audioContext.destination);

    if (!skipConnect) {
      await ensureSessionConnected(source);
    }

    micEnabled = true;
    elements.micButton.textContent = "Stop Mic";
    document.body.classList.add("is-listening");
    await requireDesktopApi().setVoiceState(true);
    setStatus("listening");
  } catch (error) {
    appendEntry(elements.logs, {
      kind: "error",
      title: "microphone start error",
      text: error.name ? `${error.name}: ${error.message}` : error.message,
      timestamp: new Date().toISOString()
    });
    await stopMicrophone({ updateStatus: false });
    setStatus("mic unavailable");
    throw error;
  }
}

async function stopMicrophone({ updateStatus = true } = {}) {
  micEnabled = false;
  audioSendFailureActive = false;

  if (processorNode) {
    processorNode.disconnect();
    processorNode = null;
  }

  if (audioContext) {
    await audioContext.close();
    audioContext = null;
  }

  if (microphoneStream) {
    microphoneStream.getTracks().forEach((track) => track.stop());
    microphoneStream = null;
  }

  elements.micButton.textContent = "Start Mic";
  document.body.classList.remove("is-listening");
  await requireDesktopApi().setVoiceState(false);
  if (updateStatus) {
    setStatus("idle");
  }
}

function setVisibleScreen(screen) {
  const showOnboarding = screen === "onboarding";
  document.body.classList.toggle("show-onboarding", showOnboarding);
  document.body.classList.toggle("show-workspace", !showOnboarding);
}

function showOnboardingStep(stepName, manualReturn = false) {
  setVisibleScreen("onboarding");
  elements.stepOne.classList.toggle("hidden", stepName !== "step_1_gemini_key");
  elements.stepTwo.classList.toggle("hidden", stepName !== "step_2_tools_setup");
  elements.returnToWorkspaceButton.classList.toggle("hidden", !manualReturn);
  elements.stepPillOne.classList.toggle("active", stepName === "step_1_gemini_key");
  elements.stepPillTwo.classList.toggle("active", stepName === "step_2_tools_setup");
}

function renderChecklist(container, items) {
  if (!container) {
    return;
  }
  container.innerHTML = "";
  for (const item of items) {
    const article = document.createElement("article");
    article.className = `tool-check-item ${item.status}`;
    article.innerHTML = `
      <span class="tool-check-dot" aria-hidden="true"></span>
      <div>
        <span class="tool-check-title">${item.title}</span>
        <div class="tool-check-copy">${item.copy}</div>
      </div>
    `;
    container.append(article);
  }
}

function summarizeTools(tools) {
  const values = Object.values(tools);
  const readyCount = values.filter((tool) => tool.ready).length;
  return {
    readyCount,
    total: values.length
  };
}

function fallbackServiceAction(serviceState) {
  if (serviceState.ready) {
    return {
      kind: "pass",
      text: `Live check passed at ${formatTime(serviceState.checkedAt)}.`
    };
  }

  if (!serviceState.installed) {
    return {
      kind: "fail",
      text: "Install the bundled CLI to continue."
    };
  }

  if (serviceState.key === "apple") {
    return {
      kind: serviceState.status,
      text: "Open Automation Settings, allow access, then verify again."
    };
  }

  return {
    kind: serviceState.status,
    text: "Save the token, then run verify again."
  };
}

function updateServiceCard(serviceState) {
  const chip = elements[`${serviceState.key}StatusChip`];
  const detail = elements[`${serviceState.key}StatusDetail`];
  const installState = elements[`${serviceState.key}InstallState`];
  const authState = elements[`${serviceState.key}AuthState`];
  const verifyState = elements[`${serviceState.key}VerifyState`];
  const stateMeta = elements[`${serviceState.key}StateMeta`];
  const actionNote = elements[`${serviceState.key}ActionNote`];

  if (!chip || !detail || !installState || !authState || !verifyState || !stateMeta || !actionNote) {
    return;
  }

  chip.textContent = serviceState.ready
    ? "Ready"
    : !serviceState.installed
      ? "Not installed"
      : serviceState.status === "warn"
        ? "Needs attention"
        : "Blocked";
  chip.classList.remove("pass", "warn", "fail");
  chip.classList.add(serviceState.status);
  detail.textContent = serviceState.detail;

  installState.textContent = serviceState.installed ? "Installed" : "Missing";
  authState.textContent = serviceState.key === "apple"
    ? serviceState.ready
      ? "✓ Granted"
      : serviceState.installed
        ? "Needs access"
        : "Pending"
    : serviceState.authenticated
      ? "✓ Verified"
      : serviceState.installed
        ? "Token needed"
        : "Pending";
  verifyState.textContent = serviceState.installed
    ? `${serviceState.ready ? "✓ Passed" : "Failed"} ${formatTime(serviceState.checkedAt)}`
    : "Not run";
  installState.textContent = serviceState.installed ? "✓ Installed" : "Missing";
  stateMeta.textContent = serviceState.installed
    ? `Local binary: ${serviceState.binaryPath} · Last check: ${formatTime(serviceState.checkedAt)}`
    : "Bundled macOS binary will be copied into the app-managed tools directory.";

  const currentAction = serviceActionState[serviceState.key] || fallbackServiceAction(serviceState);
  actionNote.textContent = currentAction.text;
  actionNote.className = "action-note";
  if (currentAction.kind) {
    actionNote.classList.add(currentAction.kind === "error" ? "fail" : currentAction.kind);
  }
}

function renderOnboardingState() {
  if (!onboardingState) {
    return;
  }

  elements.onboardingApiKey.value = onboardingState.settings.geminiApiKey || "";
  elements.slackTokenInput.value = onboardingState.settings.slackToken || "";
  elements.notionTokenInput.value = onboardingState.settings.notionToken || "";
  elements.stepOneContinueButton.disabled = !elements.onboardingApiKey.value.trim();
  elements.stepOneHint.textContent = onboardingState.gemini.ready
    ? "Gemini API key saved. You can continue to tool setup."
    : "Enter your Gemini API key to continue.";

  const checklistItems = [
    {
      title: "Gemini API key",
      copy: onboardingState.gemini.detail,
      status: onboardingState.gemini.ready ? "pass" : "warn"
    },
    ...Object.values(onboardingState.tools).map((tool) => ({
      title: tool.title,
      copy: tool.detail,
      status: tool.status
    }))
  ];

  renderChecklist(elements.workspaceSetupChecklist, checklistItems);

  updateServiceCard(onboardingState.tools.slack);
  updateServiceCard(onboardingState.tools.notion);
  updateServiceCard(onboardingState.tools.apple);

  if (setupViewForcedOpen) {
    showOnboardingStep("step_2_tools_setup", true);
    return;
  }

  if (onboardingState.phase === "complete") {
    setVisibleScreen("workspace");
  } else {
    showOnboardingStep(onboardingState.phase, false);
  }
}

async function refreshOnboardingState() {
  onboardingState = await requireDesktopApi().getOnboardingState();
  renderOnboardingState();
  return onboardingState;
}

async function reportVerifyResult(service) {
  try {
    const toolState = await requireDesktopApi().verifyTool(service);
    setServiceAction(
      service,
      toolState.status === "fail" ? "fail" : toolState.status,
      toolState.ready
        ? `${toolState.title} live check passed at ${formatTime(toolState.checkedAt)}.`
        : `${toolState.title} verification failed at ${formatTime(toolState.checkedAt)}.`
    );
    appendSetupActivity({
      kind: toolState.status === "fail" ? "error" : toolState.status,
      title: `${service} verify`,
      text: toolState.detail,
      timestamp: new Date().toISOString()
    });
    appendEntry(elements.logs, {
      kind: toolState.status === "fail" ? "error" : toolState.status,
      title: `${service} verify`,
      text: toolState.detail,
      timestamp: new Date().toISOString()
    });
  } finally {
    await refreshOnboardingState();
  }
}

async function runPreflightChecks() {
  const backendReport = await requireDesktopApi().runPreflight(runtimeConfigFromState());
  let microphoneStatus = "warn";

  for (const check of backendReport.checks) {
    appendEntry(elements.logs, {
      kind: check.status === "fail" ? "error" : check.status,
      title: `check: ${check.name}`,
      text: check.detail,
      timestamp: new Date().toISOString()
    });
  }

  if (navigator.mediaDevices?.getUserMedia) {
    try {
      let permissionState = "unknown";
      if (navigator.permissions?.query) {
        const permission = await navigator.permissions.query({ name: "microphone" });
        permissionState = permission.state;
      }

      const kind = permissionState === "denied" ? "warn" : "pass";
      microphoneStatus = permissionState === "denied" ? "warn" : "pass";
      appendEntry(elements.logs, {
        kind,
        title: "check: microphone",
        text: permissionState === "denied"
          ? "Microphone permission is denied in Electron or macOS."
          : `Microphone API is available. Permission state: ${permissionState}.`,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      microphoneStatus = "warn";
      appendEntry(elements.logs, {
        kind: "warn",
        title: "check: microphone",
        text: `Microphone permission check could not complete. ${error.message}`,
        timestamp: new Date().toISOString()
      });
    }
  } else {
    microphoneStatus = "fail";
    appendEntry(elements.logs, {
      kind: "error",
      title: "check: microphone",
      text: "Microphone APIs are unavailable in this renderer.",
      timestamp: new Date().toISOString()
    });
  }

  setStatus(`checks: ${backendReport.summary.pass} ok / ${backendReport.summary.warn} warn / ${backendReport.summary.fail} fail`);
  await refreshOnboardingState();

  const checklistItems = [
    {
      title: "Microphone",
      copy: microphoneStatus === "pass"
        ? "Microphone permission is available."
        : "Microphone permission still needs attention.",
      status: microphoneStatus
    }
  ];
  renderChecklist(elements.workspaceSetupChecklist, [
    ...[
      {
        title: "Gemini API key",
        copy: onboardingState.gemini.detail,
        status: onboardingState.gemini.ready ? "pass" : "warn"
      },
      ...Object.values(onboardingState.tools).map((tool) => ({
        title: tool.title,
        copy: tool.detail,
        status: tool.status
      }))
    ],
    ...checklistItems
  ]);

  return backendReport;
}

elements.onboardingApiKey.addEventListener("input", () => {
  elements.stepOneContinueButton.disabled = !elements.onboardingApiKey.value.trim();
});

elements.stepOneContinueButton.addEventListener("click", async () => {
  try {
    await requireDesktopApi().saveGeminiApiKey(elements.onboardingApiKey.value.trim());
    await refreshOnboardingState();
  } catch (error) {
    elements.stepOneHint.textContent = error.message;
  }
});

elements.backToStepOneButton.addEventListener("click", () => {
  showOnboardingStep("step_1_gemini_key", setupViewForcedOpen);
});

elements.returnToWorkspaceButton.addEventListener("click", () => {
  setupViewForcedOpen = false;
  if (onboardingState?.phase === "complete") {
    setVisibleScreen("workspace");
  }
});

elements.editSetupButton.addEventListener("click", () => {
  setupViewForcedOpen = true;
  showOnboardingStep("step_2_tools_setup", true);
});

elements.shortcutButton.addEventListener("click", () => {
  openShortcutModal();
});

document.querySelectorAll("[data-install]").forEach((button) => {
  button.addEventListener("click", async () => {
    const service = button.dataset.install;
    try {
      button.disabled = true;
      setServiceAction(service, "warn", `Installing bundled ${service} CLI...`);
      await requireDesktopApi().installTool(service);
      setServiceAction(service, "pass", `${service} CLI installed into the app-managed tools directory.`);
      appendSetupActivity({
        kind: "info",
        title: `${service} install`,
        text: `${service} CLI installed into the app-managed tools directory.`,
        timestamp: new Date().toISOString()
      });
      appendEntry(elements.logs, {
        kind: "info",
        title: `${service} install`,
        text: `${service} CLI installed into the app-managed tools directory.`,
        timestamp: new Date().toISOString()
      });
      await refreshOnboardingState();
    } catch (error) {
      setServiceAction(service, "fail", error.message);
      appendSetupActivity({
        kind: "error",
        title: `${service} install`,
        text: error.message,
        timestamp: new Date().toISOString()
      });
      appendEntry(elements.logs, {
        kind: "error",
        title: `${service} install`,
        text: error.message,
        timestamp: new Date().toISOString()
      });
    } finally {
      button.disabled = false;
    }
  });
});

document.querySelectorAll("[data-save-token]").forEach((button) => {
  button.addEventListener("click", async () => {
    const service = button.dataset.saveToken;
    const input = service === "slack" ? elements.slackTokenInput : elements.notionTokenInput;
    try {
      button.disabled = true;
      setServiceAction(service, "warn", `Saving ${service} credentials and rechecking the CLI...`);
      await requireDesktopApi().saveServiceToken(service, input.value.trim());
      setServiceAction(service, "pass", `${service} credentials were saved and rechecked.`);
      appendSetupActivity({
        kind: "info",
        title: `${service} auth`,
        text: `${service} credentials were saved and rechecked.`,
        timestamp: new Date().toISOString()
      });
      appendEntry(elements.logs, {
        kind: "info",
        title: `${service} auth`,
        text: `${service} credentials were saved and rechecked.`,
        timestamp: new Date().toISOString()
      });
      await refreshOnboardingState();
    } catch (error) {
      setServiceAction(service, "fail", error.message);
      appendSetupActivity({
        kind: "error",
        title: `${service} auth`,
        text: error.message,
        timestamp: new Date().toISOString()
      });
      appendEntry(elements.logs, {
        kind: "error",
        title: `${service} auth`,
        text: error.message,
        timestamp: new Date().toISOString()
      });
    } finally {
      button.disabled = false;
    }
  });
});

document.querySelectorAll("[data-verify]").forEach((button) => {
  button.addEventListener("click", async () => {
    const service = button.dataset.verify;
    button.disabled = true;
    await reportVerifyResult(service).catch((error) => {
      appendEntry(elements.logs, {
        kind: "error",
        title: `${service} verify`,
        text: error.message,
        timestamp: new Date().toISOString()
      });
    });
    button.disabled = false;
  });
});

document.querySelectorAll("[data-open-url]").forEach((button) => {
  button.addEventListener("click", async () => {
    try {
      await requireDesktopApi().openExternal(button.dataset.openUrl);
    } catch (error) {
      appendEntry(elements.logs, {
        kind: "error",
        title: "open link",
        text: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });
});

document.querySelectorAll("[data-open-guide]").forEach((button) => {
  button.addEventListener("click", () => {
    openGuideModal(button.dataset.openGuide);
  });
});

elements.guideCloseButton.addEventListener("click", closeGuideModal);
elements.guideModalBackdrop.addEventListener("click", closeGuideModal);
elements.shortcutCloseButton.addEventListener("click", closeShortcutModal);
elements.shortcutModalBackdrop.addEventListener("click", closeShortcutModal);
elements.shortcutCaptureButton.addEventListener("click", () => {
  beginShortcutRecording();
});
elements.shortcutPresetFnButton.addEventListener("click", () => {
  chooseShortcutPreset("Fn");
});
elements.shortcutPresetFnSpaceButton.addEventListener("click", () => {
  chooseShortcutPreset("Fn+Space");
});

elements.shortcutSaveButton.addEventListener("click", async () => {
  if (!shortcutDraft) {
    return;
  }

  try {
    shortcutState = await requireDesktopApi().setVoiceShortcut(shortcutDraft);
    appendEntry(elements.logs, {
      kind: "info",
      title: "voice shortcut",
      text: `Updated global voice shortcut to ${formatShortcutForDisplay(shortcutState.accelerator)}.`,
      timestamp: new Date().toISOString()
    });
    closeShortcutModal();
  } catch (error) {
    updateShortcutCapturePresentation({
      label: formatShortcutForDisplay(shortcutDraft),
      hint: error.message,
      tone: "fail"
    });
  }
});

elements.shortcutResetButton.addEventListener("click", async () => {
  try {
    shortcutState = await requireDesktopApi().resetVoiceShortcut();
    appendEntry(elements.logs, {
      kind: "info",
      title: "voice shortcut",
      text: `Reset global voice shortcut to ${formatShortcutForDisplay(shortcutState.accelerator)}.`,
      timestamp: new Date().toISOString()
    });
    closeShortcutModal();
  } catch (error) {
    updateShortcutCapturePresentation({
      label: "Press a new shortcut",
      hint: error.message,
      tone: "fail"
    });
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && activeGuide) {
    closeGuideModal();
    return;
  }

  if (event.key === "Escape" && !elements.shortcutModal.classList.contains("hidden")) {
    closeShortcutModal();
    return;
  }

  if (!shortcutRecording) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  const candidate = shortcutFromKeyboardEvent(event);
  if (candidate.error) {
    updateShortcutCapturePresentation({
      label: "Listening for keys...",
      hint: candidate.error,
      tone: "fail"
    });
    return;
  }

  shortcutRecording = false;
  shortcutDraft = candidate.accelerator;
  elements.shortcutCaptureButton.classList.remove("is-recording");
  updateShortcutCapturePresentation({
    label: formatShortcutForDisplay(candidate.accelerator),
    hint: "Save this shortcut to make it active everywhere.",
    tone: "pass"
  });
});

elements.connectButton.addEventListener("click", async () => {
  try {
    await ensureSessionConnected("connect button");
  } catch {
    // Connection failures are logged inside ensureSessionConnected.
  }
});

elements.checksButton.addEventListener("click", async () => {
  try {
    await runPreflightChecks();
  } catch (error) {
    appendEntry(elements.logs, {
      kind: "error",
      title: "checks error",
      text: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

elements.disconnectButton.addEventListener("click", async () => {
  await stopMicrophone({ updateStatus: false });
  stopPlayback();
  await requireDesktopApi().disconnectSession();
  setSessionConnected(false);
  setStatus("idle");
});

elements.micButton.addEventListener("click", async () => {
  try {
    if (micEnabled) {
      await stopMicrophone();
    } else {
      await startMicrophone({ source: "mic button" });
    }
  } catch (error) {
    appendEntry(elements.logs, {
      kind: "error",
      title: "microphone error",
      text: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

elements.clearLogsButton.addEventListener("click", () => {
  elements.logs.innerHTML = "";
  elements.transcript.innerHTML = "";
  lastTranscriptEntry = null;
  transcriptTurnCounter = 0;
});

elements.textForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = elements.textInput.value.trim();
  if (!text) {
    return;
  }

  await ensureSessionConnected("text prompt");
  await requireDesktopApi().sendText(text);
  elements.textInput.value = "";
});

if (desktopApi) {
  desktopApi.onStatus((payload) => {
    if (payload.kind === "connected") {
      setSessionConnected(true);
    } else if (payload.kind === "idle" || payload.kind === "closed") {
      setSessionConnected(false);
      if (micEnabled) {
        void stopMicrophone({ updateStatus: false });
      }
    }
    setStatus(payload.message);
  });

  desktopApi.onLog((payload) => {
    appendEntry(elements.logs, {
      kind: payload.level,
      title: payload.level,
      text: payload.message,
      extra: Object.keys(payload.extra || {}).length ? JSON.stringify(payload.extra, null, 2) : "",
      timestamp: payload.timestamp
    });
  });

  desktopApi.onTranscript((payload) => {
    appendTranscriptLine(payload);
  });

  desktopApi.onModelAudio((payload) => {
    void playPcm16(payload.base64Data, 24000);
  });

  desktopApi.onInterruption(() => {
    stopPlayback();
  });

  desktopApi.onVoiceToggleRequest(async () => {
    try {
      if (micEnabled) {
        await stopMicrophone();
      } else {
        await startMicrophone({ source: "global shortcut" });
      }
    } catch (error) {
      appendEntry(elements.logs, {
        kind: "error",
        title: "voice toggle error",
        text: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });
} else {
  appendEntry(elements.logs, {
    kind: "error",
    title: "preload error",
    text: "Electron preload bridge did not load. The app cannot talk to the main process until it is restarted with the preload fix.",
    timestamp: new Date().toISOString()
  });
}

setSessionConnected(false);

void Promise.all([refreshOnboardingState(), loadVoiceShortcutState()])
  .then(async (state) => {
    const onboarding = state[0];
    if (onboarding.phase === "complete") {
      await runPreflightChecks();
    }
  })
  .catch((error) => {
    appendEntry(elements.logs, {
      kind: "error",
      title: "startup error",
      text: error.message,
      timestamp: new Date().toISOString()
    });
  });
