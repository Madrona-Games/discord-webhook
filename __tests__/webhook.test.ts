import {jest, expect, describe, test, beforeEach} from '@jest/globals'

jest.mock('@actions/core', () => ({
  info: jest.fn(),
  error: jest.fn()
}))

const mockPostJson =
  jest.fn<
    (
      url: string,
      payload: unknown
    ) => Promise<{statusCode: number; result: unknown}>
  >()
jest.mock('@actions/http-client', () => ({
  HttpClient: jest.fn().mockImplementation(() => ({
    postJson: mockPostJson
  }))
}))

const mockCreateReadStream = jest.fn<(path: string) => unknown>()
jest.mock('node:fs', () => ({
  createReadStream: mockCreateReadStream
}))

const mockBlob = jest.fn<(stream: unknown) => Promise<Blob>>()
jest.mock('node:stream/consumers', () => ({
  blob: mockBlob
}))

const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>
globalThis.fetch = mockFetch

import {isValidWebhookUrl, executeWebhook} from '../lib/discord/webhook'
import * as core from '@actions/core'

const VALID_URL = 'https://discord.com/api/webhooks/123456789/abcdef-token'

describe('isValidWebhookUrl', () => {
  test('accepts standard discord.com URL', () => {
    expect(
      isValidWebhookUrl('https://discord.com/api/webhooks/123/token')
    ).toBe(true)
  })

  test('accepts discordapp.com URL', () => {
    expect(
      isValidWebhookUrl('https://discordapp.com/api/webhooks/123/token')
    ).toBe(true)
  })

  test('accepts canary subdomain', () => {
    expect(
      isValidWebhookUrl('https://canary.discord.com/api/webhooks/123/token')
    ).toBe(true)
  })

  test('accepts ptb subdomain', () => {
    expect(
      isValidWebhookUrl('https://ptb.discord.com/api/webhooks/123/token')
    ).toBe(true)
  })

  test('rejects non-discord URL', () => {
    expect(isValidWebhookUrl('https://evil.com/api/webhooks/123/token')).toBe(
      false
    )
  })

  test('rejects http scheme', () => {
    expect(isValidWebhookUrl('http://discord.com/api/webhooks/123/token')).toBe(
      false
    )
  })

  test('rejects empty string', () => {
    expect(isValidWebhookUrl('')).toBe(false)
  })

  test('rejects URL without webhooks path', () => {
    expect(isValidWebhookUrl('https://discord.com/channels/123')).toBe(false)
  })
})

describe('executeWebhook', () => {
  beforeEach(() => {
    mockPostJson.mockReset()
    mockFetch.mockReset()
    mockBlob.mockReset()
    mockCreateReadStream.mockReset()
    jest.mocked(core.info).mockClear()
  })

  describe('URL validation', () => {
    test('throws on invalid webhook URL', async () => {
      await expect(
        executeWebhook('https://evil.com/steal', '', '', false, {})
      ).rejects.toThrow('Invalid Discord webhook URL')
    })
  })

  describe('JSON payload', () => {
    test('posts payload to webhook URL', async () => {
      mockPostJson.mockResolvedValue({statusCode: 200, result: 'ok'})
      const payload = {content: 'Hello'}

      await executeWebhook(VALID_URL, '', '', false, payload)

      expect(mockPostJson).toHaveBeenCalledWith(VALID_URL, payload)
    })

    test('appends thread_id query parameter', async () => {
      mockPostJson.mockResolvedValue({statusCode: 200, result: 'ok'})

      await executeWebhook(VALID_URL, '12345', '', false, {})

      const calledUrl = new URL(mockPostJson.mock.calls[0][0] as string)
      expect(calledUrl.searchParams.get('thread_id')).toBe('12345')
    })

    test('appends wait=true when wait is true', async () => {
      mockPostJson.mockResolvedValue({statusCode: 200, result: 'ok'})

      await executeWebhook(VALID_URL, '', '', true, {})

      const calledUrl = new URL(mockPostJson.mock.calls[0][0] as string)
      expect(calledUrl.searchParams.get('wait')).toBe('true')
    })

    test('does not append wait when false', async () => {
      mockPostJson.mockResolvedValue({statusCode: 200, result: 'ok'})

      await executeWebhook(VALID_URL, '', '', false, {})

      const calledUrl = new URL(mockPostJson.mock.calls[0][0] as string)
      expect(calledUrl.searchParams.has('wait')).toBe(false)
    })

    test('combines thread_id and wait parameters', async () => {
      mockPostJson.mockResolvedValue({statusCode: 200, result: 'ok'})

      await executeWebhook(VALID_URL, '999', '', true, {})

      const calledUrl = new URL(mockPostJson.mock.calls[0][0] as string)
      expect(calledUrl.searchParams.get('thread_id')).toBe('999')
      expect(calledUrl.searchParams.get('wait')).toBe('true')
    })

    test('logs response info on success', async () => {
      mockPostJson.mockResolvedValue({statusCode: 200, result: 'ok'})

      await executeWebhook(VALID_URL, '', '', false, {})

      expect(core.info).toHaveBeenCalledWith(
        expect.stringContaining('Webhook returned 200')
      )
    })
  })

  describe('error handling', () => {
    test('throws on 400 response', async () => {
      mockPostJson.mockResolvedValue({statusCode: 400, result: 'Bad Request'})

      await expect(
        executeWebhook(VALID_URL, '', '', false, {})
      ).rejects.toThrow('Status code: 400')
    })

    test('throws on 500 response', async () => {
      mockPostJson.mockResolvedValue({statusCode: 500, result: 'Server Error'})

      await expect(
        executeWebhook(VALID_URL, '', '', false, {})
      ).rejects.toThrow('Status code: 500')
    })
  })

  describe('file upload', () => {
    beforeEach(() => {
      mockBlob.mockResolvedValue(new Blob(['content']))
      mockCreateReadStream.mockReturnValue('mock-stream')
    })

    test('sends file via fetch with FormData', async () => {
      mockFetch.mockResolvedValue({ok: true, status: 200} as Response)
      const appendSpy = jest.spyOn(FormData.prototype, 'append')

      const payload = {content: 'with file'}
      await executeWebhook(VALID_URL, '', '/path/to/image.png', false, payload)

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const [url, options] = mockFetch.mock.calls[0]
      expect(url).toBe(VALID_URL)
      expect((options as RequestInit).method).toBe('POST')
      expect(appendSpy).toHaveBeenCalledWith(
        'upload-file',
        expect.anything(),
        'image.png'
      )
      const payloadJsonCall = appendSpy.mock.calls.find(
        call => call[0] === 'payload_json'
      )
      expect(payloadJsonCall).toBeDefined()
      expect(payloadJsonCall![1]).toBe(JSON.stringify(payload))
      appendSpy.mockRestore()
    })

    test('throws on upload failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        statusText: 'Forbidden'
      } as Response)

      await expect(
        executeWebhook(VALID_URL, '', 'file.txt', false, {})
      ).rejects.toThrow('Failed to upload file: Forbidden')
    })

    test('logs success on upload', async () => {
      mockFetch.mockResolvedValue({ok: true, status: 200} as Response)

      await executeWebhook(VALID_URL, '', 'file.txt', false, {})

      expect(core.info).toHaveBeenCalledWith(
        expect.stringContaining('successfully uploaded file')
      )
    })

    test('uses fetch instead of HttpClient for file upload', async () => {
      mockFetch.mockResolvedValue({ok: true, status: 200} as Response)

      await executeWebhook(VALID_URL, '', 'file.txt', false, {})

      expect(mockPostJson).not.toHaveBeenCalled()
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
  })
})
