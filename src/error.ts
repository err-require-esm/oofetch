import type { FetchContext, IFetchError } from './types'

// Augment `FetchError` type to include `IFetchError` properties
export interface FetchError<T = any> extends IFetchError<T> {}

// eslint-disable-next-line ts/no-unsafe-declaration-merging
export class FetchError<T = any> extends Error implements IFetchError<T> {
  constructor(message: string, opts?: ErrorOptions) {
    super(message, opts)

    this.name = 'FetchError'
  }
}

export function createFetchError<T = any>(
  ctx: FetchContext<T>,
): IFetchError<T> {
  const errorMessage = ctx.error?.message ?? ctx.error?.toString() ?? ''

  const method
    = (ctx.request as Request)?.method ?? ctx.options?.method ?? 'GET'
  const url = (ctx.request as Request)?.url || String(ctx.request) || '/'
  const requestStr = `[${method}] ${JSON.stringify(url)}`

  const statusStr = ctx.response
    ? `${ctx.response.status} ${ctx.response.statusText}`
    : '<no response>'

  const message = `${requestStr}: ${statusStr}${
    errorMessage ? ` ${errorMessage}` : ''
  }`

  const fetchError: FetchError<T> = new FetchError(
    message,
    ctx.error ? { cause: ctx.error } : undefined,
  )

  for (const key of ['request', 'options', 'response'] as const) {
    Object.defineProperty(fetchError, key, {
      // eslint-disable-next-line sonarjs/function-return-type
      get() {
        return ctx[key]
      },
    })
  }

  for (const [key, refKey] of [
    ['data', '_data'],
    ['status', 'status'],
    ['statusCode', 'status'],
    ['statusText', 'statusText'],
    ['statusMessage', 'statusText'],
  ] as const) {
    Object.defineProperty(fetchError, key, {
      // eslint-disable-next-line sonarjs/function-return-type
      get() {
        return ctx.response && ctx.response[refKey]
      },
    })
  }

  return fetchError
}
