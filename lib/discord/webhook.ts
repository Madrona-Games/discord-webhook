import { blob } from 'node:stream/consumers'
import { createReadStream } from 'node:fs'
import * as core from '@actions/core'
// eslint-disable-next-line import/named
import { TypedResponse } from '@actions/http-client/lib/interfaces'
import { HttpClient } from '@actions/http-client'
import path from 'node:path'

const client = new HttpClient()

const DISCORD_WEBHOOK_URL_PATTERN = /^https:\/\/(canary\.|ptb\.)?discord(\.com|app\.com)\/api\/webhooks\//

export function isValidWebhookUrl(webhookUrl: string): boolean {
  return DISCORD_WEBHOOK_URL_PATTERN.test(webhookUrl)
}

async function handleResponse(response: TypedResponse<unknown>): Promise<void> {
  core.info(
    `Webhook returned ${response.statusCode} with message: ${response.result}. Please see discord documentation at https://discord.com/developers/docs/resources/webhook#execute-webhook for more information`
  )
  if (response.statusCode >= 400) {
    throw new Error(
      `Discord Webhook Action failed to execute webhook. Status code: ${response.statusCode}`
    )
  }
}

export async function executeWebhook(
  webhookUrl: string,
  threadId: string,
  filePath: string,
  wait: boolean,
  payload: unknown): Promise<void> {

  if (!isValidWebhookUrl(webhookUrl)) {
    throw new Error('Invalid Discord webhook URL. URL must match the pattern: https://discord.com/api/webhooks/{id}/{token}')
  }

  const url = new URL(webhookUrl)

  if (threadId !== '') {
    url.searchParams.set('thread_id', threadId)
  }

  if (wait) {
    url.searchParams.set('wait', 'true')
  }

  const finalUrl = url.toString()

  if (filePath === '') {
    const response = await client.postJson(finalUrl, payload)
    await handleResponse(response)
  }
  else {
    const formData = new FormData()
    const fileName = path.basename(filePath);
    formData.append('upload-file', await blob(createReadStream(filePath)) as unknown as Blob, fileName)
    formData.append('payload_json', JSON.stringify(payload))

    const response = await fetch(finalUrl, {
      method: 'POST',
      body: formData
    })

    if (response.ok) {
      core.info(
        `successfully uploaded file with status code: ${response.status}`
      )
    } else {
      throw new Error(`Failed to upload file: ${response.statusText}`)
    }
  }
}
