import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import type { NativeVoiceMessage } from './protocol.js'

export interface NativeVoiceConfig {
  readonly helperPath: string
}

/** Runs the platform speech recognizer against an uploaded audio file. */
export class NativeVoiceSession {
  constructor(private readonly config: NativeVoiceConfig) {}

  /**
   * Transcribes a local audio file and resolves with the final recognized text.
   * The helper does not access a microphone in file mode.
   * @param filePath - Absolute path to a supported audio file.
   * @returns The recognized text.
   */
  transcribe(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.config.helperPath, ['--file', filePath, '--json-lines'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let finalText = ''
      let settled = false
      const finish = (error?: Error): void => {
        if (settled) return
        settled = true
        if (error !== undefined) reject(error)
        else resolve(finalText)
      }
      const lines = createInterface({ input: child.stdout })
      lines.on('line', line => {
        let message: NativeVoiceMessage
        try {
          message = JSON.parse(line) as NativeVoiceMessage
        } catch {
          finish(new Error('native recognizer emitted invalid JSON'))
          child.kill()
          return
        }
        if (message.type === 'final' || message.type === 'partial') {
          finalText = message.text
        } else {
          finish(new Error(message.message))
          child.kill()
        }
      })
      let stderr = ''
      child.stderr.on('data', chunk => { stderr += String(chunk) })
      child.once('error', error => finish(error))
      child.once('close', (code, signal) => {
        if (settled) return
        if (code === 0) {
          finish()
          return
        }
        const reason = code === null ? `signal ${signal ?? 'unknown'}` : `code ${String(code)}`
        finish(new Error(stderr.trim() || `native recognizer exited with ${reason}`))
      })
    })
  }

  /** Releases resources owned by this plugin. */
  dispose(): void {}
}
