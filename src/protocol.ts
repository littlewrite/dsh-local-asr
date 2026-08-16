/** Wire messages emitted by a native voice helper. */
export type NativeVoiceMessage =
  | { readonly type: 'partial'; readonly text: string }
  | { readonly type: 'final'; readonly text: string }
  | { readonly type: 'error'; readonly message: string }
