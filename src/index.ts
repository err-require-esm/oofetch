import { createFetch } from './base'

export * from './base'

export type * from './types'

export const ofetch = createFetch({
  AbortController: globalThis.AbortController,
  fetch: globalThis.fetch,
  Headers: globalThis.Headers,
})

export const $fetch = ofetch
