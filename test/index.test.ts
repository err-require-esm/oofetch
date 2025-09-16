import type { Listener } from 'listhen'

import {
  createApp,
  createError,
  eventHandler,
  readBody,
  readRawBody,
  toNodeListener,
} from 'h3'
import { listen } from 'listhen'
import { Buffer } from 'node:buffer'
import { Readable } from 'node:stream'
import { getQuery, joinURL } from 'ufo'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { $fetch } from '../src'

describe('ofetch', () => {
  let listener: Listener
  const getURL = (url: string) => joinURL(listener.url, url)

  const fetch = vi.spyOn(globalThis, 'fetch')

  beforeAll(async () => {
    const app = createApp()
      .use(
        '/ok',
        eventHandler(() => 'ok'),
      )
      .use(
        '/params',
        eventHandler(event => getQuery(event.node.req.url ?? '')),
      )
      .use(
        '/url',
        eventHandler(event => event.node.req.url),
      )
      .use(
        '/echo',
        eventHandler(async event => ({
          body:
            event.node.req.method === 'POST'
              ? await readRawBody(event)
              : undefined,
          headers: event.node.req.headers,
          path: event.path,
        })),
      )
      .use(
        '/post',
        eventHandler(async event => ({
          body: await readBody(event),
          headers: event.node.req.headers,
        })),
      )
      .use(
        '/binary',
        eventHandler((event) => {
          event.node.res.setHeader('Content-Type', 'application/octet-stream')
          return new Blob(['binary'])
        }),
      )
      .use(
        '/403',
        eventHandler(() =>
          createError({ status: 403, statusMessage: 'Forbidden' }),
        ),
      )
      .use(
        '/408',
        eventHandler(() => createError({ status: 408 })),
      )
      .use(
        '/204',
        eventHandler(() => null),
      )
      .use(
        '/timeout',
        eventHandler(async () => {
          await new Promise((resolve) => {
            // eslint-disable-next-line @masknet/prefer-timer-id, sonarjs/no-nested-functions
            setTimeout(() => {
              resolve(createError({ status: 408 }))
            }, 1000 * 5)
          })
        }),
      )

    listener = await listen(toNodeListener(app))
  })

  beforeEach(() => {
    fetch.mockClear()
  })

  afterAll(() => {
    listener.close().catch(console.error)
  })

  it('ok', async () => {
    expect(await $fetch(getURL('ok'))).to.equal('ok')
  })

  it('custom parseResponse', async () => {
    let called = 0
    const parser = (r: string) => {
      called++
      return `C${r}`
    }
    expect(await $fetch(getURL('ok'), { parseResponse: parser })).to.equal(
      'Cok',
    )
    expect(called).to.equal(1)
  })

  it('allows specifying FetchResponse method', async () => {
    expect(
      await $fetch(getURL('params?test=true'), { responseType: 'json' }),
    ).to.deep.equal({ test: 'true' })
    expect(
      await $fetch(getURL('params?test=true'), { responseType: 'blob' }),
    ).to.be.instanceOf(Blob)
    expect(
      await $fetch(getURL('params?test=true'), { responseType: 'text' }),
    ).to.equal('{"test":"true"}')
    expect(
      await $fetch(getURL('params?test=true'), { responseType: 'arrayBuffer' }),
    ).to.be.instanceOf(ArrayBuffer)
  })

  it('returns a blob for binary content-type', async () => {
    expect(await $fetch(getURL('binary'))).to.be.instanceOf(Blob)
  })

  it('baseURL', async () => {
    expect(await $fetch('/x?foo=123', { baseURL: getURL('url') })).to.equal(
      '/x?foo=123',
    )
  })

  it('stringifies posts body automatically', async () => {
    const { body } = await $fetch(getURL('post'), {
      body: { num: 42 },
      method: 'POST',
    })
    expect(body).to.deep.eq({ num: 42 })

    const body2 = (
      await $fetch(getURL('post'), {
        body: [{ num: 42 }, { num: 43 }],
        method: 'POST',
      })
    ).body
    expect(body2).to.deep.eq([{ num: 42 }, { num: 43 }])

    let body3
    await $fetch(getURL('post'), {
      body: { num: 42 },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      method: 'POST',
      onResponse(ctx) {
        body3 = ctx.options.body
      },
    })
    expect(body3).equals('num=42')

    const headerFetches = [
      [['X-header', '1']],
      { 'x-header': '1' },
      new Headers({ 'x-header': '1' }),
    ]

    for (const sentHeaders of headerFetches) {
      const { headers } = await $fetch(getURL('post'), {
        body: { num: 42 },
        headers: sentHeaders as HeadersInit,
        method: 'POST',
      })
      expect(headers).to.include({ 'x-header': '1' })
      expect(headers).to.include({ accept: 'application/json' })
    }
  })

  it('does not stringify body when content type != application/json', async () => {
    const message = '"Hallo von Pascal"'
    const { body } = await $fetch(getURL('echo'), {
      body: message,
      headers: { 'Content-Type': 'text/plain' },
      method: 'POST',
    })
    expect(body).to.deep.eq(message)
  })

  it('handle Buffer body', async () => {
    const message = 'Hallo von Pascal'
    const { body } = await $fetch(getURL('echo'), {
      body: Buffer.from('Hallo von Pascal'),
      headers: { 'Content-Type': 'text/plain' },
      method: 'POST',
    })
    expect(body).to.deep.eq(message)
  })

  it(
    'handle ReadableStream body',
    async () => {
      const message = 'Hallo von Pascal'
      const { body } = await $fetch(getURL('echo'), {
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(message))
            controller.close()
          },
        }),
        headers: {
          'content-length': '16',
        },
        method: 'POST',
      })
      expect(body).to.deep.eq(message)
    },
  )

  it('handle Readable body', async () => {
    const message = 'Hallo von Pascal'
    const { body } = await $fetch(getURL('echo'), {
      body: new Readable({
        read() {
          this.push(message)
          this.push(null)
        },
      }),
      headers: {
        'content-length': '16',
      },
      method: 'POST',
    })
    expect(body).to.deep.eq(message)
  })

  it('bypass FormData body', async () => {
    const data = new FormData()
    data.append('foo', 'bar')
    const { body } = await $fetch(getURL('post'), {
      body: data,
      method: 'POST',
    })
    expect(body).to.include('form-data; name="foo"')
  })

  it('bypass URLSearchParams body', async () => {
    const data = new URLSearchParams({ foo: 'bar' })
    const { body } = await $fetch(getURL('post'), {
      body: data,
      method: 'POST',
    })
    expect(body).toMatchObject({ foo: 'bar' })
  })

  it('404', async () => {
    const error = await $fetch(getURL('404')).catch(error_ => error_)
    expect(error.toString()).to.contain('Cannot find any path matching /404.')
    expect(error.data).to.deep.eq({
      stack: [],
      statusCode: 404,
      statusMessage: 'Cannot find any path matching /404.',
    })
    expect(error.response?._data).to.deep.eq(error.data)
    expect(error.request).to.equal(getURL('404'))
  })

  it('403 with ignoreResponseError', async () => {
    const res = await $fetch(getURL('403'), { ignoreResponseError: true })
    expect(res?.statusCode).to.eq(403)
    expect(res?.statusMessage).to.eq('Forbidden')
  })

  it('204 no content', async () => {
    const res = await $fetch(getURL('204'))
    expect(res).toBeUndefined()
  })

  it('hEAD no content', async () => {
    const res = await $fetch(getURL('/ok'), { method: 'HEAD' })
    expect(res).toBeUndefined()
  })

  it('baseURL with retry', async () => {
    const error = await $fetch('', { baseURL: getURL('404'), retry: 3 }).catch(
      error_ => error_,
    )
    expect(error.request).to.equal(getURL('404'))
  })

  it('retry with number delay', async () => {
    const slow = $fetch<string>(getURL('408'), {
      retry: 2,
      retryDelay: 100,
    }).catch(() => 'slow')
    const fast = $fetch<string>(getURL('408'), {
      retry: 2,
      retryDelay: 1,
    }).catch(() => 'fast')

    const race = await Promise.race([slow, fast])
    expect(race).to.equal('fast')
  })

  it('retry with callback delay', async () => {
    const slow = $fetch<string>(getURL('408'), {
      retry: 2,
      retryDelay: () => 100,
    }).catch(() => 'slow')
    const fast = $fetch<string>(getURL('408'), {
      retry: 2,
      retryDelay: () => 1,
    }).catch(() => 'fast')

    const race = await Promise.race([slow, fast])
    expect(race).to.equal('fast')
  })

  it('abort with retry', async () => {
    const controller = new AbortController()
    async function abortHandle() {
      controller.abort()
      const response = await $fetch('', {
        baseURL: getURL('ok'),
        retry: 3,
        signal: controller.signal,
      })
      // eslint-disable-next-line no-console
      console.log('response', response)
    }
    await expect(abortHandle()).rejects.toThrow(/aborted/)
  })

  it('passing request obj should return request obj in error', async () => {
    const error = await $fetch(getURL('/403'), { method: 'post' }).catch(
      error => error,
    )
    expect(error.toString()).toBe(
      'FetchError: [POST] "http://localhost:3000/403": 403 Forbidden',
    )
    expect(error.request).to.equal(getURL('403'))
    expect(error.options.method).to.equal('POST')
    expect(error.response?._data).to.deep.eq(error.data)
  })

  it('aborting on timeout', async () => {
    const noTimeout = $fetch(getURL('timeout')).catch(() => 'no timeout')
    const timeout = $fetch(getURL('timeout'), {
      retry: 0,
      timeout: 100,
    }).catch(() => 'timeout')
    const race = await Promise.race([noTimeout, timeout])
    expect(race).to.equal('timeout')
  })

  it('aborting on timeout reason', async () => {
    await $fetch(getURL('timeout'), {
      retry: 0,
      timeout: 100,
    }).catch((error: { cause: Error }) => {
      expect(error.cause.message).to.include(
        'The operation was aborted due to timeout',
      )
      expect(error.cause.name).to.equal('TimeoutError')
      expect((error.cause as unknown as { code: number }).code).to.equal(DOMException.TIMEOUT_ERR)
    })
  })

  it('deep merges defaultOptions', async () => {
    const _customFetch = $fetch.create({
      headers: {
        'x-header-a': '0',
        'x-header-b': '2',
      },
      params: {
        b: 2,
      },
      query: {
        a: 0,
      },
    })
    const { headers, path } = await _customFetch(getURL('echo'), {
      headers: {
        'Content-Type': 'text/plain',
        'x-header-a': '1',
        'x-header-c': '3',
      },
      params: {
        c: 3,
      },
      query: {
        a: 1,
      },
    })

    expect(headers).to.include({
      'x-header-a': '1',
      'x-header-b': '2',
      'x-header-c': '3',
    })

    const parseParams = (str: string) =>
      Object.fromEntries(new URLSearchParams(str).entries())
    expect(parseParams(path as string)).toMatchObject(parseParams('?b=2&c=3&a=1'))
  })

  it('uses request headers', async () => {
    expect(
      await $fetch(
        new Request(getURL('echo'), { headers: { foo: '1' } }),
        {},
      ).then(r => r.headers),
    ).toMatchObject({ foo: '1' })

    expect(
      await $fetch(new Request(getURL('echo'), { headers: { foo: '1' } }), {
        headers: { bar: '3', foo: '2' },
      }).then(r => r.headers),
    ).toMatchObject({ bar: '3', foo: '2' })
  })

  it('hook errors', async () => {
    // onRequest
    await expect(
      $fetch(getURL('/ok'), {
        onRequest: () => {
          throw new Error('error in onRequest')
        },
      }),
    ).rejects.toThrow('error in onRequest')

    // onRequestError
    await expect(
      $fetch('/' /* non absolute is not acceptable */, {
        onRequestError: () => {
          throw new Error('error in onRequestError')
        },
      }),
    ).rejects.toThrow('error in onRequestError')

    // onResponse
    await expect(
      $fetch(getURL('/ok'), {
        onResponse: () => {
          throw new Error('error in onResponse')
        },
      }),
    ).rejects.toThrow('error in onResponse')

    // onResponseError
    await expect(
      $fetch(getURL('/403'), {
        onResponseError: () => {
          throw new Error('error in onResponseError')
        },
      }),
    ).rejects.toThrow('error in onResponseError')
  })

  it('calls hooks', async () => {
    const onRequest = vi.fn()
    const onRequestError = vi.fn()
    const onResponse = vi.fn()
    const onResponseError = vi.fn()

    await $fetch(getURL('/ok'), {
      onRequest,
      onRequestError,
      onResponse,
      onResponseError,
    })

    expect(onRequest).toHaveBeenCalledOnce()
    expect(onRequestError).not.toHaveBeenCalled()
    expect(onResponse).toHaveBeenCalledOnce()
    expect(onResponseError).not.toHaveBeenCalled()

    onRequest.mockReset()
    onRequestError.mockReset()
    onResponse.mockReset()
    onResponseError.mockReset()

    await $fetch(getURL('/403'), {
      onRequest,
      onRequestError,
      onResponse,
      onResponseError,
    }).catch(error => error)

    expect(onRequest).toHaveBeenCalledOnce()
    expect(onRequestError).not.toHaveBeenCalled()
    expect(onResponse).toHaveBeenCalledOnce()
    expect(onResponseError).toHaveBeenCalledOnce()

    onRequest.mockReset()
    onRequestError.mockReset()
    onResponse.mockReset()
    onResponseError.mockReset()

    await $fetch(getURL('/ok'), {
      onRequest: [onRequest, onRequest],
      onRequestError: [onRequestError, onRequestError],
      onResponse: [onResponse, onResponse],
      onResponseError: [onResponseError, onResponseError],
    })

    expect(onRequest).toHaveBeenCalledTimes(2)
    expect(onRequestError).not.toHaveBeenCalled()
    expect(onResponse).toHaveBeenCalledTimes(2)
    expect(onResponseError).not.toHaveBeenCalled()

    onRequest.mockReset()
    onRequestError.mockReset()
    onResponse.mockReset()
    onResponseError.mockReset()

    await $fetch(getURL('/403'), {
      onRequest: [onRequest, onRequest],
      onRequestError: [onRequestError, onRequestError],
      onResponse: [onResponse, onResponse],
      onResponseError: [onResponseError, onResponseError],
    }).catch(error => error)

    expect(onRequest).toHaveBeenCalledTimes(2)
    expect(onRequestError).not.toHaveBeenCalled()
    expect(onResponse).toHaveBeenCalledTimes(2)
    expect(onResponseError).toHaveBeenCalledTimes(2)
  })

  it('default fetch options', async () => {
    await $fetch('https://jsonplaceholder.typicode.com/todos/1', {})
    expect(fetch).toHaveBeenCalledOnce()
    const options = fetch.mock.calls[0][1]
    expect(options).toStrictEqual({
      headers: expect.any(Headers),
    })
  })
})
