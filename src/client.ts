import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { VoiceButton } from './client/VoiceButton.js'

type VoiceButtonProps = PropsRuntime<'conversation.input.right'> & {
  setDraft: (text: string) => void
}

/** Client services consumed by the Composer slot contribution. */
export const inject = ['slots', 'sessions', 'conversation']

/** Client plugin entry that adds the local ASR button to the Composer. */
export function apply(ctx: ClientContext): void {
  ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
    name: 'conversation.input.right',
    id: 'dsh-local-asr',
    order: 40,
    inject: (sessionId: SessionId): Pick<VoiceButtonProps, 'setDraft'> => ({
      setDraft: text => {
        const binding = ctx.sessions.binding(sessionId)
        if (binding === undefined) return
        const input = ctx.conversation.input.for(binding.ctx)
        const draft = input.state.getSnapshot().draft
        input.setDraft(draft === '' ? text : `${draft}\n${text}`)
      },
    }),
  }, VoiceButton))
}
