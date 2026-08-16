# dsh-local-asr

Local speech-to-text for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

`dsh-local-asr` adds two related capabilities to a DSH Web profile:

- A Composer microphone button that records in the browser, uploads a PCM WAV file to the Harness host, and inserts the local transcription into the draft.
- A model-facing `local_asr` tool that transcribes an audio file available on the Harness host and returns text to the agent.

The plugin is local-first. It does not use Whisper, a third-party desktop voice application, or a cloud speech API. macOS uses the Speech Framework with on-device recognition when available. Windows uses the installed Windows Speech Recognition engine.

中文说明见 [`README.zh.md`](README.zh.md)。

## Features

- Browser microphone input for remote DSH Web sessions.
- Local macOS speech recognition through `SFSpeechURLRecognitionRequest`.
- Windows file transcription through `System.Speech.Recognition`.
- Model-facing `local_asr` function call.
- Temporary audio files are removed after transcription.
- Browser audio is resampled to mono 16 kHz PCM WAV for native helper compatibility.
- No speech-recognition network service and no ASR API key.

## Runtime flow

```text
Browser microphone
  -> PCM WAV in the browser
  -> POST /api/dsh-local-asr/transcribe
  -> temporary file on the Harness host
  -> macOS Speech Framework or Windows Speech Recognition
  -> transcript
  -> Composer draft
```

The `local_asr` tool uses the same native helper path, but accepts an audio-file path already available on the Harness host:

```text
local_asr({ file_path: "/absolute/path/to/recording.wav" })
  -> local native speech recognizer
  -> text
```

The first version is an audio transcription capability. Video containers are not automatically demuxed; extract their audio with a media tool before calling `local_asr`.

## Source installation

This project distributes source code, not signed native applications. The repository does not commit compiled `.app` or `.exe` files. Each developer must build the native helper on the target operating system.

The current release does not provide a prebuilt binary installer. Installing only the GitHub bundle is not enough until the native helper has been built locally.

```sh
git clone https://github.com/littlewrite/dsh-local-asr.git
cd dsh-local-asr
pnpm install
pnpm run build
```

Build the macOS helper locally. Xcode Command Line Tools are required:

```sh
pnpm run build:macos
```

The build creates a local app bundle under `native/macos/` with an ad-hoc signature. This is not Apple Developer ID signing and the app is not notarized; macOS may still show the normal local-app permission prompts.

On Windows, build the helper with the .NET Framework developer tools:

```powershell
pnpm run build:windows
```

The script builds `native/windows/SpeechRecognizer.csproj` and copies the executable to `native/windows/dsh-voice-windows.exe`, which is the default path used by the plugin. The executable is local build output and is intentionally ignored by Git. If you prefer to invoke MSBuild directly, copy its `bin/Release/net472/dsh-voice-windows.exe` output to that path.

Add the plugin to a Web profile:

```json
{
  "dependencies": {
    "dsh-local-asr": "link:/absolute/path/to/dsh-local-asr"
  }
}
```

Then add the bundle to the profile patch:

```yaml
- id: dsh-local-asr
  config:
    maxAudioBytes: 26214400
```

Restart the Harness Web process after changing the plugin or profile.

The bundle resolves the locally built helper automatically on macOS and Windows. Set `DSH_LOCAL_ASR_HELPER_PATH` or provide `helperPath` in the profile only when using a custom helper build.

Do not use `npx -y github:littlewrite/dsh-local-asr install` as a binary installer. The repository intentionally does not ship signed native binaries. After building locally, point the Web profile at the local checkout as shown above and restart `dsh web`.

## macOS permissions

The browser needs microphone permission on the device where the Web Composer is open.

The Mac running Harness needs Speech Recognition permission for the native helper. It does not need Mac microphone permission because the helper reads the uploaded audio file instead of opening the host microphone.

Request the macOS speech permission through LaunchServices:

```sh
pnpm run request:macos-permissions
```

Approve the Speech Recognition permission in System Settings, then restart Harness.

On-device recognition is required. If the selected locale is unavailable for on-device recognition, the helper returns an error instead of silently using a cloud service.

## Windows

Windows must have a compatible installed speech-recognition language. The locally built helper reads the uploaded WAV file and does not open the Windows host microphone.

## Model tool

The plugin registers this model-facing tool:

```text
local_asr
```

Parameters:

```json
{
  "file_path": "/absolute/path/to/audio.wav"
}
```

The tool returns the final transcript as text. It is intended for audio files already accessible to the Harness host. A future attachment adapter can map DSH session attachment IDs to temporary local files without exposing arbitrary host paths to the model.

## Development

```sh
pnpm run typecheck
pnpm run build
pnpm run build:macos
```

The JavaScript plugin is platform-neutral. Native helpers must be built and tested on their target operating systems.

## Security and privacy

Installing a DSH plugin runs third-party code with the permissions of the Harness process. Review the source before installing it.

This plugin limits browser uploads by `maxAudioBytes`, writes them to a temporary directory, passes them to the configured native helper, and removes the temporary directory after the request. The `local_asr` tool currently accepts an absolute host path, so deployments should pair it with the Harness workspace and tool authorization policy before exposing it to untrusted agents.

## License

MIT
