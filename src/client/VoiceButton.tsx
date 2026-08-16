import { useRef, useState } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

type Props = PropsRuntime<'conversation.input.right'> & { setDraft: (text: string) => void }
type State = 'idle' | 'recording' | 'uploading' | 'error'

/** Records the browser user's microphone and sends a local WAV for transcription. */
export function VoiceButton({ setDraft }: Props): JSX.Element {
  const [state, setState] = useState<State>('idle')
  const [message, setMessage] = useState<string>()
  const recorder = useRef<BrowserRecorder | undefined>(undefined)

  async function toggle(): Promise<void> {
    if (state === 'recording') {
      setState('uploading')
      try {
        const audio = await recorder.current?.stop()
        recorder.current = undefined
        if (audio === undefined) throw new Error('voice recorder is not running')
        const response = await fetch('/api/dsh-local-asr/transcribe', {
          method: 'POST',
          headers: { 'content-type': 'audio/wav' },
          body: audio,
        })
        const result = await response.json() as { text?: string; message?: string }
        if (!response.ok) throw new Error(result.message ?? `transcription failed (${response.status})`)
        const text = result.text?.trim() ?? ''
        if (text !== '') setDraft(text)
        setMessage(undefined)
        setState('idle')
      } catch (error) {
        recorder.current = undefined
        setMessage(error instanceof Error ? error.message : String(error))
        setState('error')
      }
      return
    }
    if (state !== 'idle' && state !== 'error') return
    try {
      setMessage(undefined)
      const next = new BrowserRecorder()
      await next.start()
      recorder.current = next
      setState('recording')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
      setState('error')
    }
  }

  const recording = state === 'recording'
  const label = recording ? '停止并识别语音' : state === 'uploading' ? '正在识别语音' : '开始语音输入'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <button
        type="button"
        aria-label={label}
        aria-busy={state === 'uploading'}
        title={message ?? label}
        disabled={state === 'uploading'}
        onClick={() => { void toggle() }}
      >
        {recording ? '■' : state === 'uploading' ? '…' : state === 'error' ? '⚠' : '🎙'}
      </button>
      {message !== undefined && (
        <span role="status" aria-live="polite" style={{ color: '#b42318', fontSize: 12 }}>
          {message}
        </span>
      )}
    </span>
  )
}

class BrowserRecorder {
  private readonly chunks: Float32Array[] = []
  private readonly context = new AudioContext()
  private stream?: MediaStream
  private processor?: ScriptProcessorNode
  private source?: MediaStreamAudioSourceNode

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    this.source = this.context.createMediaStreamSource(this.stream)
    this.processor = this.context.createScriptProcessor(4096, 1, 1)
    this.processor.onaudioprocess = event => {
      const input = event.inputBuffer.getChannelData(0)
      this.chunks.push(new Float32Array(input))
      event.outputBuffer.getChannelData(0).fill(0)
    }
    this.source.connect(this.processor)
    this.processor.connect(this.context.destination)
    await this.context.resume()
  }

  async stop(): Promise<Blob> {
    this.processor?.disconnect()
    this.source?.disconnect()
    this.stream?.getTracks().forEach(track => track.stop())
    await this.context.close()
    const samples = resample(merge(this.chunks), this.context.sampleRate, 16_000)
    return new Blob([encodeWav(samples, 16_000)], { type: 'audio/wav' })
  }
}

function merge(chunks: readonly Float32Array[]): Float32Array {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0)
  const result = new Float32Array(length)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}

function resample(samples: Float32Array, sourceRate: number, targetRate: number): Float32Array {
  if (sourceRate === targetRate) return samples
  const length = Math.max(1, Math.round(samples.length * targetRate / sourceRate))
  const result = new Float32Array(length)
  const ratio = sourceRate / targetRate
  for (let index = 0; index < length; index++) {
    const position = index * ratio
    const lower = Math.floor(position)
    const upper = Math.min(lower + 1, samples.length - 1)
    const weight = position - lower
    result[index] = (samples[lower] ?? 0) * (1 - weight) + (samples[upper] ?? 0) * weight
  }
  return result
}

function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  writeAscii(view, 8, 'WAVE')
  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeAscii(view, 36, 'data')
  view.setUint32(40, samples.length * 2, true)
  for (let index = 0; index < samples.length; index++) {
    const sample = Math.max(-1, Math.min(1, samples[index] ?? 0))
    view.setInt16(44 + index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
  }
  return buffer
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index++) view.setUint8(offset + index, value.charCodeAt(index))
}
