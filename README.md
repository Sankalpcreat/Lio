# Lio

Lio is a macOS desktop app that connects `gemini-3.1-flash-live-preview` to local CLI tools on macOS.

## What It Does

- Starts a Gemini Live session with audio input and audio output
- Streams microphone audio to Gemini 3.1 Flash Live
- Plays Gemini audio responses locally
- Exposes Slack, Notion, and Apple CLIs as Gemini function-calling tools
- Shows transcripts and execution logs in one desktop window
- Runs startup and on-demand preflight checks for Gemini key presence, CLI binary paths, Slack auth, Notion auth, Apple automation access, and microphone readiness
- Renders transcript turns in chronological `You` and `Gemini` lines
- Runs as a macOS tray/menu bar app and can stay hidden in the background

## Current Tool Model

This app exposes full-access and fallback tool functions:

- `slack_cli`
- `slack_read`
- `slack_write`
- `notion_cli`
- `notion_read`
- `notion_write`
- `apple_cli`
- `apple_read`
- `apple_write`

The app now prefers `slack_cli`, `notion_cli`, and `apple_cli` so Gemini can use the full command surfaces directly. The read/write variants remain available as fallbacks.

## Important Limitation

Gemini 3.1 Flash Live can **request** any of these tools, but it does **not** execute local commands natively. The Electron app executes the binaries and returns results back to Gemini using Live API tool responses.

Also note:

- Gemini 3.1 Flash Live currently uses **synchronous** tool calling in Live API
- full CLI access is enabled by default
- bundled prebuilt macOS binaries are included under `assets/prebuilt/macos-arm64/`
- if `slack-cli`, `notion`, or `apple` are already installed elsewhere on your machine, point the app to those paths during setup instead

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy environment variables:

```bash
cp .env.example .env
```

3. Fill in:

- `GEMINI_API_KEY`
- `SLACK_CLI_PATH` if `slack-cli` is not on `PATH`
- `NOTION_CLI_PATH` if needed
- `APPLE_CLI_PATH` if `apple` is not on `PATH`

4. Start the app:

```bash
npm start
```

## Build A Real macOS App

1. Put your logo in one of these paths:

- `assets/logo.png`
- `assets/logo.svg`

2. Generate icons and package the app:

```bash
npm run dist
```

That produces a signed-ness-neutral local build in `dist/`:

- `Lio.app`
- macOS `.dmg`

If you only want the unpacked app bundle without DMG/ZIP:

```bash
npm run pack
```

Notes:

- the icon pipeline uses `scripts/generate-icons.sh`
- if you replace the placeholder `assets/logo.svg` with your real logo, the next build will regenerate `assets/icon.icns`
- the current build is for local macOS distribution; code signing and notarization are not configured yet

When the app opens, it automatically runs a preflight pass. You can rerun it with the `Run Checks` button.

Menu bar behavior:

- Closing the window hides the app to the menu bar instead of quitting
- Click the tray icon to show or hide the window
- Use the tray menu to start or stop listening while the app stays in the background

What it verifies:

- Gemini API key presence
- Slack CLI binary path and `auth test`
- Notion CLI binary path and `user me`
- Apple CLI binary path and a read-only `reminders lists` probe
- renderer microphone availability and permission state

## Verification

Run a basic syntax check:

```bash
npm run check
```

## Notes About Your CLIs

- Lio can use the bundled prebuilt binaries or custom local paths you provide
- If you already have compatible Slack, Notion, or Apple CLIs installed elsewhere, point the UI fields at the real binaries
