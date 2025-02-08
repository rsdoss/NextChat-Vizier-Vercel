import { EventStreamContentType, fetchEventSource } from '@fortaine/fetch-event-source'
import { POST, createHeaders } from './common'
import { ChatStreamPayload, Provider } from './types'

export const config = {
  runtime: 'edge',
  regions: ['hkg1'],
}

// Export Dify.ai as a provider implementation
export class DifyProvider implements Provider {
  private apiKey: string
  private baseUrl: string

  constructor(apiKey: string, baseUrl?: string) {
    this.apiKey = apiKey
    this.baseUrl = baseUrl || 'https://api.dify.ai/v1'
  }

  async sendMessage(payload: ChatStreamPayload) {
    const { signal } = payload

    const body = {
      query: payload.messages[payload.messages.length - 1].content,
      response_mode: 'streaming',
      user: payload.userId || 'default-user',
      conversation_id: payload.conversationId || '',
    }

    let response: Response | undefined
    let error: Error | undefined

    try {
      response = await fetch(`${this.baseUrl}/chat-messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal,
      })
    } catch (e) {
      error = e as Error
    }

    if (error) {
      throw error
    }

    if (!response?.ok) {
      const json = await response?.json()
      throw new Error(json?.message || 'Network error')
    }

    const encoder = new TextEncoder()
    const decoder = new TextDecoder()

    return new ReadableStream({
      async start(controller) {
        let streamResponse = ''

        try {
          await fetchEventSource(`${this.baseUrl}/chat-messages`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify(body),
            signal,
            async onmessage(msg) {
              if (msg.data === '' || msg.data === '[DONE]') {
                return
              }

              const data = JSON.parse(msg.data)
              if (data.event === 'message') {
                streamResponse += data.answer
                controller.enqueue(encoder.encode(data.answer))
              } else if (data.event === 'message_end') {
                controller.close()
              } else if (data.event === 'error') {
                throw new Error(data.message)
              }
            },
            onclose() {
              controller.close()
            },
            onerror(err) {
              controller.error(err)
            },
          })
        } catch (e) {
          controller.error(e)
        }
      },
    })
  }
}