# dsh-local-asr

面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的本地语音转文字插件。

English 主文档见 [`README.md`](README.md)。

## 项目定位

`dsh-local-asr` 为 DeepSeek Harness Web Profile 提供两种能力：

1. Web Composer 语音输入：浏览器采集用户麦克风，生成 PCM WAV，上传给运行 Harness 的机器，再使用本机 macOS 或 Windows 语音识别能力转写，最后把文字写入输入框。
2. `local_asr` Function Call：让 LLM 通过 Tool 调用本地 ASR，把 Harness 主机上已有的音频文件转换为文本。

整个语音识别过程不依赖 Whisper、第三方桌面语音软件或在线 ASR 服务。模型后续处理转写文本时，仍然按照正常 LLM 请求消耗 Token。

## 工作流程

```text
浏览器麦克风
  -> 浏览器生成单声道 16 kHz PCM WAV
  -> POST /api/dsh-local-asr/transcribe
  -> Harness Backend 临时保存音频
  -> macOS Speech Framework / Windows Speech Recognition
  -> 返回文字
  -> 写入 Composer 草稿
```

Tool 调用流程：

```text
local_asr({ file_path: "/absolute/path/to/audio.wav" })
  -> 本地原生语音识别
  -> 返回文字
```

当前版本面向音频文件。视频容器不会自动提取音轨；处理视频时，应先提取音频，再调用 `local_asr`。

## 当前能力

- 支持远程浏览器访问 Harness Web 后使用浏览器麦克风录音。
- macOS 使用 `SFSpeechURLRecognitionRequest`。
- macOS 强制使用设备端识别；设备端能力不可用时返回错误。
- Windows 使用 `System.Speech.Recognition` 读取 WAV 文件。
- 注册模型可见的 `local_asr` Tool。
- 音频只写入临时目录，转写完成后删除。
- 不需要 ASR API Key。
- 不需要运行服务器 Mac 的麦克风采集。

## 源码安装和配置

本项目只分发源码，不分发经过签名的 native 应用。仓库不会提交编译后的 `.app` 或 `.exe`，开发者需要在目标操作系统上自行构建 native helper。

当前版本没有提供预编译二进制安装器。只安装 GitHub bundle 还不够，必须先在本机完成 native helper 构建。

```sh
git clone https://github.com/littlewrite/dsh-local-asr.git
cd dsh-local-asr
pnpm install
pnpm run build
pnpm run build:macos
```

构建结果会写入 `native/macos/`，这是使用 ad-hoc 签名的本地 app bundle，不是 Apple Developer ID 签名，也没有 notarization；macOS 仍可能显示普通的本地应用权限提示。

在 Windows 上构建 native helper：

```powershell
pnpm run build:windows
```

脚本会构建 `native/windows/SpeechRecognizer.csproj`，并把可执行文件复制到插件默认查找的 `native/windows/dsh-voice-windows.exe`。该文件属于本地构建产物，已被 Git 忽略，不会提交到仓库。如果直接使用 MSBuild，需要把 `bin/Release/net472/dsh-voice-windows.exe` 复制到上述路径。

Web Profile 中添加依赖：

```json
{
  "dependencies": {
    "dsh-local-asr": "link:/absolute/path/to/dsh-local-asr"
  }
}
```

在 Profile patch 中添加：

```yaml
- id: dsh-local-asr
  config:
    maxAudioBytes: 26214400
```

修改插件或 Profile 后，需要重启 Harness Web 进程。

bundle 会在 macOS 和 Windows 上自动寻找本地构建的 native helper。只有使用自定义 helper 构建时，才需要设置 `DSH_LOCAL_ASR_HELPER_PATH` 或在 Profile 中显式配置 `helperPath`。

本项目不会把 macOS 的 `.app` 或 Windows 的 `.exe` 提交到仓库。macOS 可以执行 `pnpm run build:macos`，macOS 环境不会生成 Windows `.exe`。

不要把 `npx -y github:littlewrite/dsh-local-asr install` 当作二进制安装器使用。完成本地构建后，将 Web Profile 指向本地 checkout，然后重启 `dsh web`。当前可以使用 Harness 的插件安装命令：

```sh
dsh plugin --profile web add --save-exact github:OWNER/dsh-local-asr
```

如果当前只有源码版 Harness：

```sh
cd /path/to/deepseek-harness
pnpm dsh plugin --profile web add --save-exact github:OWNER/dsh-local-asr
```

## 权限说明

远程浏览器端需要允许当前浏览器访问麦克风。

运行 Harness 的 macOS 只需要 Speech Recognition 权限，不需要 Mac 麦克风权限，因为后端只读取浏览器上传的音频文件。

执行：

```sh
pnpm run request:macos-permissions
```

然后在 macOS 系统设置中允许 Speech Recognition。

## Function Call

Tool 名称：

```text
local_asr
```

参数：

```json
{
  "file_path": "/absolute/path/to/audio.wav"
}
```

返回值是识别后的纯文本。

当前 `file_path` 指向 Harness 主机上的文件。后续可以接入 Harness 的 session attachment，将用户上传的附件安全映射成临时文件，再交给 `local_asr`，避免让模型直接访问任意主机路径。

## Windows

在 Windows 上构建：

```powershell
pnpm run build:windows
```

Profile 中将 `helperPath` 改为生成的 Windows 可执行文件路径：

```yaml
helperPath: C:\path\to\dsh-voice-windows.exe
```

Windows 需要安装兼容的语音识别语言包。

## 安全提示

DSH 插件以 Harness 进程权限运行，安装前应检查源码。

当前 `local_asr` 接受绝对文件路径。正式用于不受信任的 Agent 时，应结合 Harness 的工作区权限和 Tool 授权策略，限制可读取的文件范围。

## License

MIT
