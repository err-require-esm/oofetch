import { createFetch } from './base'

export * from './base'

export type * from './types'

export const fetch = async (...args: Parameters<typeof globalThis.fetch>) => globalThis.fetch(...args)

export const ofetch = createFetch({
  AbortController,
  fetch,
  Headers,
})

export const $fetch = ofetch
