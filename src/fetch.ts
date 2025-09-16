import type { Readable } from 'node:stream'

import destr from 'destr'
import { withBase, withQuery } from 'ufo'

import type {
  $Fetch,
  CreateFetchOptions,
  FetchContext,
  FetchOptions,
  FetchRequest,
  FetchResponse,
  ResponseType,
} from './types'

import { createFetchError } from './error'
import {
  callHooks,
  detectResponseType,
  isJSONSerializable,
  isPayloadMethod,
  resolveFetchOptions,
} from './utils'

// https://developer.mozilla.org/en-US/docs/Web/HTTP/Status
const retryStatusCodes = new Set([
  408, // Request Timeout
  409, // Conflict
  425, // Too Early (Experimental)
  429, // Too Many Requests
  500, // Internal Server Error
  502, // Bad Gateway
  503, // Service Unavailable
  504, // Gateway Timeout
])

// https://developer.mozilla.org/en-US/docs/Web/API/Response/body
const nullBodyResponses = new Set([101, 204, 205, 304])

export function createFetch(globalOptions: CreateFetchOptions = {}): $Fetch {
  const {
    AbortController = globalThis.AbortController,
    fetch = globalThis.fetch,
    Headers = globalThis.Headers,
  } = globalOptions

  // eslint-disable-next-line sonarjs/cognitive-complexity
  async function onError(context: FetchContext): Promise<FetchResponse<any>> {
    // Is Abort
    // If it is an active abort, it will not retry automatically.
    // https://developer.mozilla.org/en-US/docs/Web/API/DOMException#error_names
    const isAbort
      = (context.error
        && context.error.name === 'AbortError'
        && context.options.timeout == null)
      || false
    // Retry
    if (context.options.retry !== false && !isAbort) {
      let retries
      if (typeof context.options.retry === 'number') {
        retries = context.options.retry
      }
      else {
        retries = isPayloadMethod(context.options.method) ? 0 : 1
      }

      const responseCode = (context.response && context.response.status) || 500
      if (
        retries > 0
        && (Array.isArray(context.options.retryStatusCodes)
          ? context.options.retryStatusCodes.includes(responseCode)
          : retryStatusCodes.has(responseCode))
      ) {
        const retryDelay
          = typeof context.options.retryDelay === 'function'
            ? context.options.retryDelay(context)
            : context.options.retryDelay ?? 0
        if (retryDelay > 0) {
          // eslint-disable-next-line @masknet/prefer-timer-id
          await new Promise(resolve => setTimeout(resolve, retryDelay))
        }
        // Timeout
        return $fetchRaw(context.request, {
          ...context.options,
          retry: retries - 1,
        })
      }
    }

    // Throw normalized error
    const error = createFetchError(context)

    // Only available on V8 based runtimes (https://v8.dev/docs/stack-trace-api)
    if ('captureStackTrace' in Error)
      Error.captureStackTrace(error, $fetchRaw)

    throw error
  }

  // eslint-disable-next-line sonarjs/cognitive-complexity
  async function $fetchRaw<
    T = any,
    R extends ResponseType = 'json',
  >(_request: FetchRequest, _options: FetchOptions<R> = {}) {
    const context: FetchContext = {
      error: undefined,
      options: resolveFetchOptions<R, T>(
        _request,
        _options,
        // eslint-disable-next-line @masknet/type-no-force-cast-via-top-type
        globalOptions.defaults as unknown as FetchOptions<R, T>,
        Headers,
      ),
      request: _request,
      response: undefined,
    }

    // Uppercase method name
    if (context.options.method != null)
      context.options.method = context.options.method.toUpperCase()

    if (context.options.onRequest)
      await callHooks(context, context.options.onRequest)

    if (typeof context.request === 'string') {
      if (context.options.baseURL != null) {
        context.request = withBase(context.request, context.options.baseURL)
      }
      if (context.options.query) {
        context.request = withQuery(context.request, context.options.query)
        delete context.options.query
      }
      if ('query' in context.options) {
        delete context.options.query
      }
      if ('params' in context.options) {
        // eslint-disable-next-line sonarjs/deprecation
        delete context.options.params
      }
    }

    if (context.options.body != null && isPayloadMethod(context.options.method)) {
      if (isJSONSerializable(context.options.body)) {
        const contentType = context.options.headers.get('content-type')

        // Automatically stringify request bodies, when not already a string.
        if (typeof context.options.body !== 'string') {
          context.options.body
            = contentType === 'application/x-www-form-urlencoded'
              ? new URLSearchParams(
                  context.options.body as Record<string, any>,
                ).toString()
              : JSON.stringify(context.options.body)
        }

        // Set Content-Type and Accept headers to application/json by default
        // for JSON serializable request bodies.
        // Pass empty object as older browsers don't support undefined.
        context.options.headers = new Headers(context.options.headers ?? {})
        if (contentType == null) {
          context.options.headers.set('content-type', 'application/json')
        }
        if (!context.options.headers.has('accept')) {
          context.options.headers.set('accept', 'application/json')
        }
      }
      else if (
        // ReadableStream Body
        ('pipeTo' in (context.options.body as ReadableStream)
          && typeof (context.options.body as ReadableStream).pipeTo
          === 'function')
        // Node.js Stream Body
        || typeof (context.options.body as Readable).pipe === 'function'
      ) {
        if (!('duplex' in context.options)) {
          context.options.duplex = 'half'
        }
      }
    }

    let abortTimeout: NodeJS.Timeout | undefined

    // TODO: Can we merge signals?
    if (!context.options.signal && context.options.timeout != null) {
      const controller = new AbortController()
      abortTimeout = setTimeout(() => {
        const error = new Error(
          '[TimeoutError]: The operation was aborted due to timeout',
        )
        error.name = 'TimeoutError';
        // eslint-disable-next-line ts/no-unsafe-member-access
        (error as any).code = 23 // DOMException.TIMEOUT_ERR
        controller.abort(error)
      }, context.options.timeout)
      context.options.signal = controller.signal
    }

    try {
      context.response = await fetch(
        context.request,
        context.options as RequestInit,
      )
    }
    catch (error) {
      context.error = error as Error
      if (context.options.onRequestError) {
        await callHooks(
          context as FetchContext & { error: Error },
          context.options.onRequestError,
        )
      }
      return await onError(context)
    }
    finally {
      if (abortTimeout) {
        clearTimeout(abortTimeout)
      }
    }

    const hasBody = (context.response.body != null
    // https://github.com/unjs/ofetch/issues/324
    // https://github.com/unjs/ofetch/issues/294
    // https://github.com/JakeChampion/fetch/issues/1454
      || '_bodyInit' in context.response)
    && !nullBodyResponses.has(context.response.status)
    && context.options.method !== 'HEAD'

    if (hasBody) {
      const responseType
        = (context.options.parseResponse
          ? 'json'
          : context.options.responseType)
        || detectResponseType(context.response.headers.get('content-type') ?? '')

      // We override the `.json()` method to parse the body more securely with `destr`
      switch (responseType) {
        case 'json': {
          const data = await context.response.text()
          const parseFunction = context.options.parseResponse || destr
          context.response._data = parseFunction(data)
          break
        }
        case 'stream': {
          context.response._data
            = context.response.body ?? (context.response as { _bodyInit?: ReadableStream<Uint8Array<ArrayBuffer>> })._bodyInit // (see refs above)
          break
        }
        case 'arrayBuffer':
        case 'blob':
        case 'text':
        default: {
          context.response._data = await context.response[responseType]()
        }
      }
    }

    if (context.options.onResponse) {
      await callHooks(
        context as FetchContext & { response: FetchResponse<any> },
        context.options.onResponse,
      )
    }

    if (
      !context.options.ignoreResponseError
      && context.response.status >= 400
      && context.response.status < 600
    ) {
      if (context.options.onResponseError) {
        await callHooks(
          context as FetchContext & { response: FetchResponse<any> },
          context.options.onResponseError,
        )
      }
      return onError(context)
    }

    return context.response
  }

  const $fetch = async function $fetch(request, options) {
    const r = await $fetchRaw(request, options)
    // eslint-disable-next-line ts/no-unsafe-return
    return r._data
  } as $Fetch

  $fetch.raw = $fetchRaw

  $fetch.native = async (...args) => fetch(...args)

  $fetch.create = (defaultOptions = {}, customGlobalOptions = {}) =>
    createFetch({
      ...globalOptions,
      ...customGlobalOptions,
      defaults: {
        ...globalOptions.defaults,
        ...customGlobalOptions.defaults,
        ...defaultOptions,
      },
    })

  return $fetch
}
