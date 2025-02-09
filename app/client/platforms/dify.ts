import { ChatRequest, ChatResponse } from "@/app/typing"
import { DifyConfig } from "@/app/config/dify"
import { ChatOptions, LLMApi, LLMModel, LLMUsage, SpeechOptions } from "../api"
import { getMessageTextContent } from "@/app/utils"
import { RequestMessage } from "@/app/typing"

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

export class DifyApi implements LLMApi {
  path(path: string): string {
    return `${DifyConfig.baseUrl}${path}`
  }

  extractMessage(res: any) {
    return res.answer || ""
  }

  async chat(options: ChatOptions) {
    const lastMessage = options.messages[options.messages.length - 1]
    const query = getMessageTextContent(lastMessage)

    if (!query?.trim()) {
      throw new DifyError('Query cannot be empty')
    }

    const controller = new AbortController()
    options.onController?.(controller)

    try {
      const response = await fetch(this.path("/chat-messages"), {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${DifyConfig.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          query,
          user: "user", // TODO: Add proper user ID handling
          response_mode: "blocking"
        }),
        signal: controller.signal
      })

      const data = await response.json()

      if (!response.ok) {
        throw new DifyError(
          data.message || 'Unknown API error',
          response.status,
          data.code
        )
      }

      const message = this.extractMessage(data)
      options.onFinish(message, response)

    } catch (error) {
      if (error instanceof DifyError) {
        throw error
      }
      const errorMessage = error instanceof Error ? error.message : String(error)
      throw new DifyError(`Failed to send chat message: ${errorMessage}`)
    }
  }

  speech(options: SpeechOptions): Promise<ArrayBuffer> {
    throw new Error("Speech not implemented for Dify")
  }

  async usage(): Promise<LLMUsage> {
    return {
      used: 0,
      total: 0
    }
  }

  async models(): Promise<LLMModel[]> {
    // Return an empty array since Dify doesn't expose a models list API
    return []
  }
}