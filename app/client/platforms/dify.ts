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
          user: "user",
          inputs: {},
          response_mode: "streaming" // Changed from blocking to streaming mode
        }),
        signal: controller.signal
      })

      if (!response.ok) {
        const data = await response.json()
        throw new DifyError(
          data.message || 'Unknown API error',
          response.status,
          data.code
        )
      }

      let fullMessage = ""
      const reader = response.body?.getReader()
      if (!reader) throw new DifyError("No response body")

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          // Convert the chunk to text
          const chunk = new TextDecoder().decode(value)
          try {
            // Dify sends data: {json} format
            const lines = chunk.split('\n')
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const jsonStr = line.slice(6) // Remove 'data: ' prefix
                if (jsonStr === '[DONE]') continue
                
                const data = JSON.parse(jsonStr)
                if (data.answer) {
                  const newText = data.answer
                  fullMessage += newText
                  options.onUpdate?.(fullMessage, newText)
                }
              }
            }
          } catch (e) {
            console.warn("Failed to parse chunk", e)
          }
        }

        // Send the final message
        options.onFinish(fullMessage, response)
      } finally {
        reader.releaseLock()
      }
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