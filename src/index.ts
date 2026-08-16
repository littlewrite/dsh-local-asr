import { randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { WebServer } from '@deepseek-ai/dsh-host-webserver'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { NativeVoiceSession } from './native.js'

export interface Config {
  /** Optional absolute path to a custom native Speech Framework/SAPI helper. */
  readonly helperPath?: string
  /** Maximum uploaded audio size in bytes. */
  readonly maxAudioBytes: number
}

/** Runtime-validated native helper configuration. */
export const Config: z<Config> = z.object({
  helperPath: z.string(),
  maxAudioBytes: z.natural().min(1).default(25 * 1024 * 1024),
})

declare module '@deepseek-ai/cordis' {
  interface Context {
    webServer: WebServer
  }
}

/** Required Host services. */
export const inject = ['webServer', 'tools']

/** Host plugin for browser audio upload and local platform speech recognition. */
export function apply(ctx: Context, config: Config): void {
  const session = new NativeVoiceSession({
    helperPath: config.helperPath ?? process.env.DSH_LOCAL_ASR_HELPER_PATH ?? defaultHelperPath(),
  })
  ctx.effect(() => {
    const disposeTool = ctx.tools.register(defineTool({
      name: 'local_asr',
      description: 'Transcribe a local audio file with the operating system speech recognizer. The result is text only; recognition stays on the local machine when the configured native recognizer supports on-device processing.',
      parameters: {
        file_path: {
          type: 'string',
          required: true,
          description: 'Absolute path to an audio file available on the Harness host. Use an audio file, not a remote URL.',
        },
      },
      output: {
        schema: { type: 'string' as const },
        render: (_args, value) => [{ type: 'text' as const, text: value }],
      },
      execute: async (args: { file_path: string }) => session.transcribe(args.file_path),
      presentCall: args => ({ card: 'generic', title: `Transcribe ${args.file_path}`, kind: 'execute' }),
    }))
    const dispose = registerRoutes(ctx.webServer, session, config.maxAudioBytes)
    return () => {
      dispose()
      disposeTool()
      session.dispose()
    }
  }, 'dsh-local-asr: routes')
}

function defaultHelperPath(): string {
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  if (process.platform === 'darwin') {
    return join(packageRoot, 'native', 'macos', 'dsh-voice-macos.app', 'Contents', 'MacOS', 'dsh-voice-macos')
  }
  if (process.platform === 'win32') {
    return join(packageRoot, 'native', 'windows', 'dsh-voice-windows.exe')
  }
  throw new Error(`dsh-local-asr does not provide a native helper for ${process.platform}`)
}

function registerRoutes(server: WebServer, session: NativeVoiceSession, maxAudioBytes: number): () => void {
  const routes = [
    server.register({
      kind: 'exact',
      path: '/api/dsh-local-asr/transcribe',
      handler: async (req, res) => { await transcribe(req, res, session, maxAudioBytes) },
    }),
  ]
  return () => { for (const dispose of routes) dispose() }
}

async function transcribe(
  req: IncomingMessage,
  res: ServerResponse,
  session: NativeVoiceSession,
  maxAudioBytes: number,
): Promise<void> {
  let directory: string | undefined
  try {
    if (req.method !== 'POST') {
      respond(res, 405, { message: 'method not allowed' })
      return
    }
    const contentLength = Number(req.headers['content-length'] ?? 0)
    if (Number.isFinite(contentLength) && contentLength > maxAudioBytes) {
      respond(res, 413, { message: 'audio upload is too large' })
      return
    }
    directory = await mkdtemp(join(tmpdir(), 'dsh-local-asr-'))
    const filePath = join(directory, `${randomUUID()}.wav`)
    await writeRequestBody(req, filePath, maxAudioBytes)
    const text = (await session.transcribe(filePath)).trim()
    respond(res, 200, { text })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    respond(res, 409, { text: '', message })
  } finally {
    if (directory !== undefined) await rm(directory, { recursive: true, force: true })
  }
}

function writeRequestBody(req: IncomingMessage, filePath: string, maxBytes: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let bytes = 0
    const output = createWriteStream(filePath, { flags: 'wx' })
    const fail = (error: Error): void => {
      req.destroy()
      output.destroy()
      reject(error)
    }
    req.on('data', chunk => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      bytes += buffer.length
      if (bytes > maxBytes) {
        fail(new Error('audio upload is too large'))
        return
      }
      if (!output.write(buffer)) req.pause()
    })
    output.on('drain', () => req.resume())
    req.once('error', fail)
    output.once('error', fail)
    req.once('end', () => output.end(() => resolve()))
  })
}

function respond(res: ServerResponse, status: number, body: Record<string, string>): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}
