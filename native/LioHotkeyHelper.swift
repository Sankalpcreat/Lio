import AppKit
import ApplicationServices
import Foundation

struct ShortcutConfig {
  enum Mode {
    case fnOnly
    case fnSpace
  }

  let rawValue: String
  let mode: Mode
}

enum HelperError: LocalizedError {
  case missingShortcut
  case unsupportedShortcut(String)

  var errorDescription: String? {
    switch self {
      case .missingShortcut:
        return "Missing --shortcut argument."
      case .unsupportedShortcut(let value):
        return "Unsupported native shortcut: \(value). This helper currently supports Fn and Fn+Space."
    }
  }
}

func emit(_ payload: [String: Any]) {
  guard let data = try? JSONSerialization.data(withJSONObject: payload, options: []),
        let text = String(data: data, encoding: .utf8) else {
    return
  }

  FileHandle.standardOutput.write(Data("\(text)\n".utf8))
}

func emitError(_ message: String) {
  emit([
    "type": "error",
    "message": message
  ])
}

func parseShortcut(from arguments: [String]) throws -> ShortcutConfig {
  guard let shortcutIndex = arguments.firstIndex(of: "--shortcut"),
        arguments.indices.contains(shortcutIndex + 1) else {
    throw HelperError.missingShortcut
  }

  let rawValue = arguments[shortcutIndex + 1]
    .split(separator: "+")
    .map { $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }
    .filter { !$0.isEmpty }

  let functionTokens = Set(["fn", "function", "globe"])
  let nonFunctionTokens = rawValue.filter { !functionTokens.contains($0) }

  guard rawValue.contains(where: { functionTokens.contains($0) }) else {
    throw HelperError.unsupportedShortcut(rawValue.joined(separator: "+"))
  }

  if nonFunctionTokens.isEmpty {
    return ShortcutConfig(rawValue: "Fn", mode: .fnOnly)
  }

  if nonFunctionTokens == ["space"] {
    return ShortcutConfig(rawValue: "Fn+Space", mode: .fnSpace)
  }

  throw HelperError.unsupportedShortcut(rawValue.joined(separator: "+"))
}

func requestAccessibility(prompt: Bool) -> Bool {
  let options = [
    kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: prompt
  ] as CFDictionary

  return AXIsProcessTrustedWithOptions(options)
}

final class HotkeyMonitor {
  private let shortcut: ShortcutConfig
  private var globalFlagsMonitor: Any?
  private var localFlagsMonitor: Any?
  private var globalKeyMonitor: Any?
  private var localKeyMonitor: Any?
  private var functionPressed = false
  private var spaceTriggeredDuringCurrentPress = false

  init(shortcut: ShortcutConfig) {
    self.shortcut = shortcut
  }

  func start() {
    globalFlagsMonitor = NSEvent.addGlobalMonitorForEvents(matching: [.flagsChanged]) { [weak self] event in
      self?.handleFlagsChanged(event)
    }

    localFlagsMonitor = NSEvent.addLocalMonitorForEvents(matching: [.flagsChanged]) { [weak self] event in
      self?.handleFlagsChanged(event)
      return event
    }

    guard shortcut.mode == .fnSpace else {
      return
    }

    globalKeyMonitor = NSEvent.addGlobalMonitorForEvents(matching: [.keyDown]) { [weak self] event in
      self?.handleKeyDown(event)
    }

    localKeyMonitor = NSEvent.addLocalMonitorForEvents(matching: [.keyDown]) { [weak self] event in
      self?.handleKeyDown(event)
      return event
    }
  }

  func stop() {
    if let globalFlagsMonitor {
      NSEvent.removeMonitor(globalFlagsMonitor)
    }
    if let localFlagsMonitor {
      NSEvent.removeMonitor(localFlagsMonitor)
    }
    if let globalKeyMonitor {
      NSEvent.removeMonitor(globalKeyMonitor)
    }
    if let localKeyMonitor {
      NSEvent.removeMonitor(localKeyMonitor)
    }
  }

  private func handleFlagsChanged(_ event: NSEvent) {
    let functionNowPressed = event.modifierFlags.contains(.function)

    if shortcut.mode == .fnOnly && functionNowPressed && !functionPressed {
      emitToggle(source: "fn")
    }

    if !functionNowPressed {
      spaceTriggeredDuringCurrentPress = false
    }

    functionPressed = functionNowPressed
  }

  private func handleKeyDown(_ event: NSEvent) {
    guard shortcut.mode == .fnSpace else {
      return
    }

    let functionActive = functionPressed || event.modifierFlags.contains(.function)
    guard functionActive else {
      return
    }

    let isSpace = event.keyCode == 49 || event.charactersIgnoringModifiers == " "
    guard isSpace && !spaceTriggeredDuringCurrentPress else {
      return
    }

    spaceTriggeredDuringCurrentPress = true
    emitToggle(source: "fn+space")
  }

  private func emitToggle(source: String) {
    emit([
      "type": "toggle",
      "shortcut": shortcut.rawValue,
      "source": source
    ])
  }
}

func installSignalHandlers(stop: @escaping () -> Void) {
  signal(SIGTERM, SIG_IGN)
  signal(SIGINT, SIG_IGN)

  let queue = DispatchQueue(label: "lio.hotkey-helper.signals")
  let sigterm = DispatchSource.makeSignalSource(signal: SIGTERM, queue: queue)
  sigterm.setEventHandler {
    stop()
    exit(0)
  }
  sigterm.resume()

  let sigint = DispatchSource.makeSignalSource(signal: SIGINT, queue: queue)
  sigint.setEventHandler {
    stop()
    exit(0)
  }
  sigint.resume()
}

do {
  let shortcut = try parseShortcut(from: CommandLine.arguments)
  let shouldPrompt = CommandLine.arguments.contains("--prompt-accessibility")
  let accessibilityTrusted = requestAccessibility(prompt: shouldPrompt)

  let app = NSApplication.shared
  app.setActivationPolicy(.accessory)

  let monitor = HotkeyMonitor(shortcut: shortcut)
  monitor.start()

  emit([
    "type": "ready",
    "shortcut": shortcut.rawValue,
    "accessibilityTrusted": accessibilityTrusted
  ])

  if !accessibilityTrusted {
    emit([
      "type": "permission",
      "kind": "accessibility",
      "status": "missing",
      "message": "Accessibility permission is required for global Fn shortcuts."
    ])
  }

  installSignalHandlers {
    monitor.stop()
  }

  RunLoop.main.run()
} catch {
  emitError(error.localizedDescription)
  exit(1)
}
