import AppKit
import Foundation
import Speech

final class Recognizer: NSObject, SFSpeechRecognizerDelegate {
    private let recognizer: SFSpeechRecognizer?
    var onFinished: (() -> Void)?
    private var finished = false

    override init() {
        recognizer = SFSpeechRecognizer(locale: Locale(identifier: "zh-CN"))
        super.init()
        recognizer?.delegate = self
    }

    func transcribe(fileURL: URL) {
        guard let recognizer else {
            finish(type: "error", text: "macOS could not create a zh-CN speech recognizer")
            return
        }
        guard SFSpeechRecognizer.authorizationStatus() == .authorized else {
            finish(
                type: "error",
                text: "macOS Speech Recognition permission is not granted. Enable DSH Local ASR in System Settings > Privacy & Security > Speech Recognition."
            )
            return
        }
        guard recognizer.supportsOnDeviceRecognition else {
            finish(type: "error", text: "on-device recognition is not supported for zh-CN on this Mac")
            return
        }
        guard FileManager.default.fileExists(atPath: fileURL.path) else {
            finish(type: "error", text: "audio file does not exist")
            return
        }

        let request = SFSpeechURLRecognitionRequest(url: fileURL)
        request.shouldReportPartialResults = false
        request.requiresOnDeviceRecognition = true
        request.taskHint = .dictation
        if #available(macOS 13.0, *) {
            request.addsPunctuation = true
        }

        recognizer.recognitionTask(with: request) { [weak self] result, error in
            guard let self else { return }
            if let result {
                self.finish(type: "final", text: result.bestTranscription.formattedString)
                return
            }
            if let error {
                self.finish(type: "error", text: error.localizedDescription)
            }
        }
    }

    func requestPermissions() async {
        _ = await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { status in
                continuation.resume(returning: status)
            }
        }
    }

    private func finish(type: String, text: String) {
        guard !finished else { return }
        finished = true
        emit(type: type, text: text)
        onFinished?()
    }

    private func emit(type: String, text: String) {
        let payload: [String: String] = type == "error"
            ? ["type": type, "message": text]
            : ["type": type, "text": text]
        guard let data = try? JSONSerialization.data(withJSONObject: payload),
              let line = String(data: data, encoding: .utf8) else { return }
        FileHandle.standardOutput.write(Data((line + "\n").utf8))
    }
}

final class ApplicationDelegate: NSObject, NSApplicationDelegate {
    private let recognizer = Recognizer()

    func applicationDidFinishLaunching(_ notification: Notification) {
        recognizer.onFinished = { NSApp.terminate(nil) }
        if CommandLine.arguments.contains("--request-permissions") {
            Task {
                await recognizer.requestPermissions()
                NSApp.terminate(nil)
            }
            return
        }
        guard let fileIndex = CommandLine.arguments.firstIndex(of: "--file"),
              fileIndex + 1 < CommandLine.arguments.count else {
            emitError("missing --file <path>")
            NSApp.terminate(nil)
            return
        }
        recognizer.transcribe(fileURL: URL(fileURLWithPath: CommandLine.arguments[fileIndex + 1]))
    }

    private func emitError(_ text: String) {
        let payload = ["type": "error", "message": text]
        guard let data = try? JSONSerialization.data(withJSONObject: payload),
              let line = String(data: data, encoding: .utf8) else { return }
        FileHandle.standardOutput.write(Data((line + "\n").utf8))
    }
}

let application = NSApplication.shared
application.setActivationPolicy(.prohibited)
let delegate = ApplicationDelegate()
application.delegate = delegate
application.run()
