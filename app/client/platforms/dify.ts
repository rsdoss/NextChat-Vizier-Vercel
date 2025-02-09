import { ChatRequest, ChatResponse } from "@/app/typing"
import { DifyConfig } from "@/app/config/dify"
import { ChatOptions, LLMApi, LLMModel, LLMUsage, SpeechOptions } from "../api"
import { getMessageTextContent } from "@/app/utils"
import { RequestMessage } from "@/app/typing"
import { safeLocalStorage } from "@/app/utils";
import { useChatStore } from "@/app/store";

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
  private static STORAGE_KEY = "dify-conversation-";

  private static getConversationStorageKey(): string {
    const sessionId = useChatStore.getState().currentSession().id;
    return this.STORAGE_KEY + sessionId;
  }

  private static getConversationId(): string | undefined {
    return safeLocalStorage().getItem(this.getConversationStorageKey()) || undefined;
  }

  private static setConversationId(id: string | undefined) {
    const key = this.getConversationStorageKey();
    if (id) {
      safeLocalStorage().setItem(key, id);
    } else {
      safeLocalStorage().removeItem(key);
    }
  }

  path(path: string): string {
    return `${DifyConfig.baseUrl}${path}`
  }

  extractMessage(res: any) {
    return res.answer || ""
  }

  async chat(options: ChatOptions) {
    const messages = options.messages;
    const lastMessage = messages[messages.length - 1];
    const query = getMessageTextContent(lastMessage);

    if (!query?.trim()) {
      throw new DifyError('Query cannot be empty')
    }

    console.log("[Dify] Current conversation state:", {
      messageCount: messages.length,
      conversationId: DifyApi.getConversationId(),
      isFirstMessage: messages.length === 1
    });

    // Only reset conversation if explicitly starting new chat
    if (messages.length === 1 && lastMessage.role === 'user') {
      if (DifyApi.getConversationId()) {
        console.log("[Dify] Resetting conversation, previous ID was:", DifyApi.getConversationId());
      }
      DifyApi.setConversationId(undefined);
    }

    const controller = new AbortController()
    options.onController?.(controller)

    try {
      const payload = {
        query,
        user: "user",
        inputs: {},
        conversation_id: DifyApi.getConversationId(),
        response_mode: "streaming"
      };

      console.log("[Dify] Sending request with payload:", payload);

      const response = await fetch(this.path("/chat-messages"), {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${DifyConfig.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      if (!response.ok) {
        const data = await response.json()
        console.error("[Dify] Request failed:", data);
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

          const chunk = new TextDecoder().decode(value)
          try {
            const lines = chunk.split('\n')
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const jsonStr = line.slice(6)
                if (jsonStr === '[DONE]') continue
                
                const data = JSON.parse(jsonStr)
                
                // Store conversation_id from the response
                if (data.conversation_id) {
                  const currentId = DifyApi.getConversationId();
                  if (currentId !== data.conversation_id) {
                    console.log("[Dify] Updating conversation ID from response:", {
                      old: currentId,
                      new: data.conversation_id
                    });
                    DifyApi.setConversationId(data.conversation_id);
                  }
                }

                if (data.answer) {
                  const newText = data.answer
                  fullMessage += newText
                  options.onUpdate?.(fullMessage, newText)
                }
              }
            }
          } catch (e) {
            console.warn("[Dify] Failed to parse chunk", e)
          }
        }

        options.onFinish(fullMessage, response)
      } finally {
        reader.releaseLock()
      }
    } catch (error) {
      console.error("[Dify] Chat error:", error);
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
    return []
  }
}