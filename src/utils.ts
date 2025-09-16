import type {
  FetchContext,
  FetchHook,
  FetchOptions,
  FetchRequest,
  ResolvedFetchOptions,
  ResponseType,
} from './types'

const payloadMethods = new Set(
  Object.freeze(['PATCH', 'POST', 'PUT', 'DELETE']),
)

export function isJSONSerializable(value: unknown): boolean {
  if (value === undefined)
    return false

  const t = typeof value
  if (t === 'string' || t === 'number' || t === 'boolean' || t == null)
    return true

  if (t !== 'object')
    return false // bigint, function, symbol, undefined

  if (value === null)
    return true

  if (Array.isArray(value))
    return true

  if ('buffer' in (value as Record<string, unknown>))
    return false

  // `FormData` and `URLSearchParams` should't have a `toJSON` method,
  // but Bun adds it, which is non-standard.
  if (value instanceof FormData || value instanceof URLSearchParams)
    return false

  return (
    (value.constructor.name === 'Object')
    || ('toJSON' in (value as Record<string, unknown>) && typeof (value as Record<string, unknown>).toJSON === 'function')
  )
}

export function isPayloadMethod(method = 'GET') {
  return payloadMethods.has(method.toUpperCase())
}

const textTypes = new Set([
  'application/html',
  'application/xhtml',
  'application/xml',
  'image/svg',
])

const JSON_RE = /^application\/(?:[\w!#$%&*.^`~-]*\+)?json(?:;.+)?$/i

export async function callHooks<C extends FetchContext = FetchContext>(
  context: C,
  hooks: FetchHook<C> | FetchHook<C>[] | undefined,
): Promise<void> {
  if (!(hooks))
    return
  if (Array.isArray(hooks)) {
    for (const hook of hooks) {
      await hook(context)
    }
  }
  else {
    await hooks(context)
  }
}

// This provides reasonable defaults for the correct parser based on Content-Type header.
export function detectResponseType(_contentType = ''): ResponseType {
  if (!_contentType)
    return 'json'

  // Value might look like: `application/json; charset=utf-8`
  const contentType = _contentType.split(';').shift() ?? ''

  if (JSON_RE.test(contentType))
    return 'json'

  // TODO
  // if (contentType === 'application/octet-stream') {
  //   return 'stream'
  // }

  // SSE
  // https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events#sending_events_from_the_server
  if (contentType === 'text/event-stream') {
    return 'stream'
  }

  if (textTypes.has(contentType) || contentType.startsWith('text/')) {
    return 'text'
  }

  return 'blob'
}

export function resolveFetchOptions<
  R extends ResponseType = ResponseType,
  T = any,
>(
  request: FetchRequest,
  input: FetchOptions<R, T> | undefined,
  defaults: FetchOptions<R, T> | undefined,
  Headers: typeof globalThis.Headers,
): ResolvedFetchOptions<R, T> {
  // Merge headers
  const headers = mergeHeaders(
    input?.headers ?? (request as Request)?.headers,
    defaults?.headers,
    Headers,
  )

  // Merge query/params
  let query: Record<string, any> | undefined
  // eslint-disable-next-line sonarjs/deprecation
  if (defaults?.query || defaults?.params || input?.params || input?.query) {
    query = {
      // eslint-disable-next-line sonarjs/deprecation
      ...defaults?.params,
      ...defaults?.query,
      // eslint-disable-next-line sonarjs/deprecation
      ...input?.params,
      ...input?.query,
    }
  }

  return {
    ...defaults,
    ...input,
    headers,
    params: query,
    query,
  }
}

function mergeHeaders(
  input: HeadersInit | undefined,
  defaults: HeadersInit | undefined,
  Headers: typeof globalThis.Headers,
): Headers {
  if (!defaults) {
    return new Headers(input)
  }
  const headers = new Headers(defaults)
  if (input) {
    for (const [key, value] of Symbol.iterator in input || Array.isArray(input)
      ? input
      : new Headers(input)) {
      headers.set(key as string, value as string)
    }
  }
  return headers
}
