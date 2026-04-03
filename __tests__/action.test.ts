import {jest, expect, describe, test, beforeEach} from '@jest/globals'

jest.mock('@actions/core', () => ({
  getInput: jest.fn().mockReturnValue(''),
  getBooleanInput: jest.fn().mockReturnValue(false),
  setFailed: jest.fn(),
  info: jest.fn(),
  error: jest.fn()
}))

jest.mock('../lib/discord/webhook', () => ({
  executeWebhook: jest
    .fn<(...args: unknown[]) => Promise<void>>()
    .mockResolvedValue(undefined)
}))

jest.mock('node:fs', () => ({
  readFileSync: jest.fn<(...args: unknown[]) => string>().mockReturnValue('{}')
}))

interface MockRefs {
  getInput: jest.Mock<(name: string) => string>
  getBooleanInput: jest.Mock<(name: string) => boolean>
  setFailed: jest.Mock
  executeWebhook: jest.Mock<(...args: unknown[]) => Promise<void>>
  readFileSync: jest.Mock<(...args: unknown[]) => string>
}

const flushPromises = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0))

beforeEach(() => {
  jest.resetModules()
})

function setupMocks(inputs: Record<string, string>): MockRefs {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const core = require('@actions/core')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const webhook = require('../lib/discord/webhook')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('node:fs')

  core.getInput.mockImplementation((name: string) => inputs[name] ?? '')
  core.getBooleanInput.mockImplementation(
    (name: string) => inputs[name] === 'true'
  )
  webhook.executeWebhook.mockResolvedValue(undefined)

  return {
    getInput: core.getInput,
    getBooleanInput: core.getBooleanInput,
    setFailed: core.setFailed,
    executeWebhook: webhook.executeWebhook,
    readFileSync: fs.readFileSync
  }
}

async function runAction(inputs: Record<string, string>): Promise<MockRefs> {
  const mocks = setupMocks(inputs)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('../src/action')
  await flushPromises()
  return mocks
}

function getPayload(mocks: MockRefs): Record<string, unknown> {
  return mocks.executeWebhook.mock.calls[0][4] as Record<string, unknown>
}

describe('action', () => {
  describe('payload creation', () => {
    test('creates content-only payload', async () => {
      const mocks = await runAction({
        'webhook-url': 'https://discord.com/api/webhooks/123/token',
        content: 'Hello, world!',
        wait: 'true'
      })

      const payload = getPayload(mocks)
      expect(payload.content).toBe('Hello, world!')
      expect(payload.embeds).toBeUndefined()
    })

    test('creates payload with username and avatar', async () => {
      const mocks = await runAction({
        'webhook-url': 'https://discord.com/api/webhooks/123/token',
        content: 'test',
        username: 'TestBot',
        'avatar-url': 'https://example.com/avatar.png',
        wait: 'true'
      })

      const payload = getPayload(mocks)
      expect(payload.username).toBe('TestBot')
      expect(payload.avatar_url).toBe('https://example.com/avatar.png')
    })

    test('includes thread_name in payload', async () => {
      const mocks = await runAction({
        'webhook-url': 'https://discord.com/api/webhooks/123/token',
        content: 'test',
        'thread-name': 'My Thread',
        wait: 'true'
      })

      const payload = getPayload(mocks)
      expect(payload.thread_name).toBe('My Thread')
    })

    test('parses color as integer', async () => {
      const mocks = await runAction({
        'webhook-url': 'https://discord.com/api/webhooks/123/token',
        'embed-title': 'Test',
        'embed-color': '16711680',
        wait: 'true'
      })

      const payload = getPayload(mocks)
      const embeds = payload.embeds as Record<string, unknown>[]
      expect(embeds[0].color).toBe(16711680)
    })

    test('parses flags as integer', async () => {
      const mocks = await runAction({
        'webhook-url': 'https://discord.com/api/webhooks/123/token',
        content: 'test',
        flags: '4',
        wait: 'true'
      })

      const payload = getPayload(mocks)
      expect(payload.flags).toBe(4)
    })

    test('parses tts as boolean true', async () => {
      const mocks = await runAction({
        'webhook-url': 'https://discord.com/api/webhooks/123/token',
        content: 'test',
        tts: 'true',
        wait: 'true'
      })

      const payload = getPayload(mocks)
      expect(payload.tts).toBe(true)
    })

    test('parses tts as boolean false', async () => {
      const mocks = await runAction({
        'webhook-url': 'https://discord.com/api/webhooks/123/token',
        content: 'test',
        tts: 'false',
        wait: 'true'
      })

      const payload = getPayload(mocks)
      expect(payload.tts).toBe(false)
    })

    test('truncates description at 4096 characters', async () => {
      const longDesc = 'a'.repeat(5000)
      const mocks = await runAction({
        'webhook-url': 'https://discord.com/api/webhooks/123/token',
        'embed-title': 'Test',
        'embed-description': longDesc,
        wait: 'true'
      })

      const payload = getPayload(mocks)
      const embeds = payload.embeds as Record<string, unknown>[]
      expect((embeds[0].description as string).length).toBe(4096)
    })

    test('does not truncate description under limit', async () => {
      const mocks = await runAction({
        'webhook-url': 'https://discord.com/api/webhooks/123/token',
        'embed-title': 'Test',
        'embed-description': 'Short description',
        wait: 'true'
      })

      const payload = getPayload(mocks)
      const embeds = payload.embeds as Record<string, unknown>[]
      expect(embeds[0].description).toBe('Short description')
    })

    test('converts timestamp to ISO string', async () => {
      const mocks = await runAction({
        'webhook-url': 'https://discord.com/api/webhooks/123/token',
        'embed-title': 'Test',
        'embed-timestamp': '2024-01-15T12:00:00Z',
        wait: 'true'
      })

      const payload = getPayload(mocks)
      const embeds = payload.embeds as Record<string, unknown>[]
      expect(embeds[0].timestamp).toBe('2024-01-15T12:00:00.000Z')
    })

    test('creates embed with author', async () => {
      const mocks = await runAction({
        'webhook-url': 'https://discord.com/api/webhooks/123/token',
        'embed-title': 'Test',
        'embed-author-name': 'Author Name',
        'embed-author-url': 'https://example.com',
        wait: 'true'
      })

      const payload = getPayload(mocks)
      const embeds = payload.embeds as Record<string, unknown>[]
      const author = embeds[0].author as Record<string, string>
      expect(author.name).toBe('Author Name')
      expect(author.url).toBe('https://example.com')
    })

    test('creates embed with footer', async () => {
      const mocks = await runAction({
        'webhook-url': 'https://discord.com/api/webhooks/123/token',
        'embed-title': 'Test',
        'embed-footer-text': 'Footer text',
        wait: 'true'
      })

      const payload = getPayload(mocks)
      const embeds = payload.embeds as Record<string, unknown>[]
      const footer = embeds[0].footer as Record<string, string>
      expect(footer.text).toBe('Footer text')
    })

    test('creates embed with image', async () => {
      const mocks = await runAction({
        'webhook-url': 'https://discord.com/api/webhooks/123/token',
        'embed-title': 'Test',
        'embed-image-url': 'https://example.com/image.png',
        wait: 'true'
      })

      const payload = getPayload(mocks)
      const embeds = payload.embeds as Record<string, unknown>[]
      const image = embeds[0].image as Record<string, string>
      expect(image.url).toBe('https://example.com/image.png')
    })

    test('creates embed with thumbnail', async () => {
      const mocks = await runAction({
        'webhook-url': 'https://discord.com/api/webhooks/123/token',
        'embed-title': 'Test',
        'embed-thumbnail-url': 'https://example.com/thumb.png',
        wait: 'true'
      })

      const payload = getPayload(mocks)
      const embeds = payload.embeds as Record<string, unknown>[]
      const thumbnail = embeds[0].thumbnail as Record<string, string>
      expect(thumbnail.url).toBe('https://example.com/thumb.png')
    })

    test('does not include embeds when no embed inputs', async () => {
      const mocks = await runAction({
        'webhook-url': 'https://discord.com/api/webhooks/123/token',
        content: 'no embeds',
        wait: 'true'
      })

      const payload = getPayload(mocks)
      expect(payload.embeds).toBeUndefined()
    })

    test('loads raw-data from file', async () => {
      const rawPayload = {content: 'from file', embeds: [{title: 'Raw'}]}
      const mocks = setupMocks({
        'webhook-url': 'https://discord.com/api/webhooks/123/token',
        'raw-data': 'payload.json',
        wait: 'true'
      })
      mocks.readFileSync.mockReturnValue(JSON.stringify(rawPayload))

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('../src/action')
      await flushPromises()

      const payload = getPayload(mocks)
      expect(payload).toEqual(rawPayload)
      expect(mocks.readFileSync).toHaveBeenCalledWith('payload.json', 'utf-8')
    })
  })

  describe('executeWebhook invocation', () => {
    test('passes webhook URL', async () => {
      const mocks = await runAction({
        'webhook-url': 'https://discord.com/api/webhooks/123/token',
        content: 'test',
        wait: 'true'
      })

      expect(mocks.executeWebhook).toHaveBeenCalledWith(
        'https://discord.com/api/webhooks/123/token',
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything()
      )
    })

    test('passes thread ID', async () => {
      const mocks = await runAction({
        'webhook-url': 'https://discord.com/api/webhooks/123/token',
        'thread-id': '456',
        content: 'test',
        wait: 'true'
      })

      expect(mocks.executeWebhook).toHaveBeenCalledWith(
        expect.anything(),
        '456',
        expect.anything(),
        expect.anything(),
        expect.anything()
      )
    })

    test('passes filename', async () => {
      const mocks = await runAction({
        'webhook-url': 'https://discord.com/api/webhooks/123/token',
        filename: 'upload.txt',
        content: 'test',
        wait: 'true'
      })

      expect(mocks.executeWebhook).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'upload.txt',
        expect.anything(),
        expect.anything()
      )
    })

    test('passes wait as boolean true', async () => {
      const mocks = await runAction({
        'webhook-url': 'https://discord.com/api/webhooks/123/token',
        content: 'test',
        wait: 'true'
      })

      expect(mocks.executeWebhook).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        true,
        expect.anything()
      )
    })

    test('passes wait as boolean false', async () => {
      const mocks = await runAction({
        'webhook-url': 'https://discord.com/api/webhooks/123/token',
        content: 'test',
        wait: 'false'
      })

      expect(mocks.executeWebhook).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        false,
        expect.anything()
      )
    })
  })

  describe('error handling', () => {
    test('calls setFailed when executeWebhook throws', async () => {
      const mocks = setupMocks({
        'webhook-url': 'https://discord.com/api/webhooks/123/token',
        content: 'test',
        wait: 'true'
      })
      mocks.executeWebhook.mockRejectedValue(new Error('Webhook failed'))

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('../src/action')
      await flushPromises()

      expect(mocks.setFailed).toHaveBeenCalledWith('Webhook failed')
    })

    test('does not call setFailed on success', async () => {
      const mocks = await runAction({
        'webhook-url': 'https://discord.com/api/webhooks/123/token',
        content: 'test',
        wait: 'true'
      })

      expect(mocks.setFailed).not.toHaveBeenCalled()
    })
  })
})
