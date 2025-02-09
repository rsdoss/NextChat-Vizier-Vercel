import { ChatRequest, ChatResponse } from "@/app/typing"
import { DifyConfig } from "@/app/config/dify"

export interface DifyChatRequest {
  query: string
  user: string
  inputs?: Record<string, any>
  response_mode?: "blocking" | "streaming"
  conversation_id?: string
}

export interface DifyChatResponse {
  answer: string
  message_id: string
  conversation_id: string
  created_at: number
  metadata: {
    usage: {
      prompt_tokens: number
      completion_tokens: number
      total_tokens: number
      total_price: string
      currency: string
      latency: number
    }
  }
}

export class DifyError extends Error {
  constructor(message: string, public status?: number, public code?: string) {
    super(message)
    this.name = 'DifyError'
  }
}

export async function sendChatMessage(request: DifyChatRequest): Promise<DifyChatResponse> {
  if (!request.query?.trim()) {
    throw new DifyError('Query cannot be empty')
  }

  try {
    const response = await fetch(`${DifyConfig.baseUrl}/chat-messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${DifyConfig.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ...request,
        response_mode: request.response_mode || "blocking"
      })
    })

    const data = await response.json()

    if (!response.ok) {
      throw new DifyError(
        data.message || 'Unknown API error',
        response.status,
        data.code
      )
    }

    return data
  } catch (error) {
    if (error instanceof DifyError) {
      throw error
    }
    throw new DifyError(`Failed to send chat message: ${error.message}`)
  }
}