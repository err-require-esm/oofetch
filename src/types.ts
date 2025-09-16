/* eslint-disable sonarjs/class-name */
// --------------------------
// $fetch API
// --------------------------

export interface $Fetch {
  <T = any, R extends ResponseType = 'json'>(
    request: FetchRequest,
    options?: FetchOptions<R>
  ): Promise<MappedResponseType<R, T>>
  create: (defaults: FetchOptions, globalOptions?: CreateFetchOptions) => $Fetch
  native: Fetch
  raw: <T = any, R extends ResponseType = 'json'>(
    request: FetchRequest,
    options?: FetchOptions<R>
  ) => Promise<FetchResponse<MappedResponseType<R, T>>>
}

// --------------------------
// Options
// --------------------------

export interface CreateFetchOptions {
  AbortController?: typeof AbortController
  defaults?: FetchOptions
  fetch?: Fetch
  Headers?: typeof Headers
}

export type Fetch = typeof globalThis.fetch

export interface FetchContext<T = any, R extends ResponseType = ResponseType> {
  error?: Error
  options: ResolvedFetchOptions<R>
  request: FetchRequest
  response?: FetchResponse<T>
}

export type FetchHook<C extends FetchContext = FetchContext> = (
  context: C
) => MaybePromise<void>

// --------------------------
// Hooks and Context
// --------------------------

export interface FetchHooks<T = any, R extends ResponseType = ResponseType> {
  onRequest?: MaybeArray<FetchHook<FetchContext<T, R>>>
  onRequestError?: MaybeArray<FetchHook<FetchContext<T, R> & { error: Error }>>
  onResponse?: MaybeArray<
    FetchHook<FetchContext<T, R> & { response: FetchResponse<T> }>
  >
  onResponseError?: MaybeArray<
    FetchHook<FetchContext<T, R> & { response: FetchResponse<T> }>
  >
}

export interface FetchOptions<R extends ResponseType = ResponseType, T = any>
  extends FetchHooks<T, R>,
  Omit<RequestInit, 'body'> {
  /**
   * Only supported older Node.js versions using node-fetch-native polyfill.
   */
  agent?: unknown

  baseURL?: string

  body?: Record<string, any> | RequestInit['body']

  /**
   * Only supported in Node.js >= 18 using undici
   *
   * @see https://undici.nodejs.org/#/docs/api/Dispatcher
   */
  dispatcher?: InstanceType<typeof import('undici').Dispatcher>

  /**
   * @experimental Set to "half" to enable duplex streaming.
   * Will be automatically set to "half" when using a ReadableStream as body.
   * @see https://fetch.spec.whatwg.org/#enumdef-requestduplex
   */
  duplex?: 'half'

  ignoreResponseError?: boolean

  /**
   * @deprecated use query instead.
   */
  params?: Record<string, any>

  parseResponse?: (responseText: string) => unknown

  query?: Record<string, any>

  responseType?: R

  retry?: false | number

  /** Delay between retries in milliseconds. */
  retryDelay?: ((context: FetchContext<T, R>) => number) | number

  /** Default is [408, 409, 425, 429, 500, 502, 503, 504] */
  retryStatusCodes?: number[]

  /** timeout in milliseconds */
  timeout?: number
}
export type FetchRequest = RequestInfo

export interface FetchResponse<T> extends Response {
  _data?: T
}

export type GlobalOptions = Pick<
  FetchOptions,
  'retry' | 'retryDelay' | 'timeout'
>

// --------------------------
// Response Types
// --------------------------

export interface IFetchError<T = any> extends Error {
  data?: T
  options?: FetchOptions
  request?: FetchRequest
  response?: FetchResponse<T>
  status?: number
  statusCode?: number
  statusMessage?: string
  statusText?: string
}

export type MappedResponseType<
  R extends ResponseType,
  JsonType = any,
> = R extends keyof ResponseMap ? ResponseMap[R] : JsonType

export interface ResolvedFetchOptions<
  R extends ResponseType = ResponseType,
  T = any,
> extends FetchOptions<R, T> {
  headers: Headers
}

export interface ResponseMap {
  arrayBuffer: ArrayBuffer
  blob: Blob
  stream: ReadableStream<Uint8Array>
  text: string
}

// --------------------------
// Error
// --------------------------

export type ResponseType = 'json' | keyof ResponseMap

// --------------------------
// Other types
// --------------------------

export interface SearchParameters {
  [key: string]: any
}

type MaybeArray<T> = T | T[]

type MaybePromise<T> = Promise<T> | T
