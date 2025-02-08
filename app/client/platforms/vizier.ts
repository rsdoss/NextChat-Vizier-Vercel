"use client";

import { ApiPath, ServiceProvider, REQUEST_TIMEOUT_MS } from "@/app/constant";
import { useAccessStore } from "@/app/store";
import { ChatOptions, LLMApi, LLMModel, SpeechOptions } from "../api";
import { getClientConfig } from "@/app/config/client";
import { getMessageTextContent } from "@/app/utils";
import { fetch } from "@/app/utils/stream";
import { EventStreamContentType, fetchEventSource } from "@fortaine/fetch-event-source";

export class VizierApi implements LLMApi {
  private disableListModels = true;
  private baseUrl: string;

  constructor() {
    const accessStore = useAccessStore.getState();
    this.baseUrl = accessStore.useCustomConfig && accessStore.vizierUrl 
      ? accessStore.vizierUrl 
      : "https://api.dify.ai/v1";
  }

  path(path: string): string {
    let baseUrl = this.baseUrl;
    if (baseUrl.endsWith("/")) {
      baseUrl = baseUrl.slice(0, baseUrl.length - 1);
    }
    console.log("[Vizier Endpoint] ", baseUrl, path);
    return [baseUrl, path].join("/");
  }

  extractMessage(res: any) {
    return res.answer || "";
  }

  async chat(options: ChatOptions) {
    const messages = options.messages.map(m => ({
      role: m.role,
      content: getMessageTextContent(m),
    }));

    const requestPayload = {
      query: messages[messages.length - 1].content,
      user: options.config.userId || "default-user",
      conversation_id: options.config.conversationId || "",
      response_mode: options.config.stream ? "streaming" : "blocking",
      inputs: {},
    };

    const shouldStream = !!options.config.stream;
    const controller = new AbortController();
    options.onController?.(controller);

    try {
      if (shouldStream) {
        let responseText = "";
        await fetchEventSource(this.path("chat-messages"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${useAccessStore.getState().vizierApiKey}`,
          },
          body: JSON.stringify(requestPayload),
          signal: controller.signal,
          async onmessage(msg) {
            if (msg.data === "" || msg.data === "[DONE]") return;
            const data = JSON.parse(msg.data);
            if (data.event === "message") {
              responseText += data.answer;
              options.onUpdate?.(responseText, data.answer);
            } else if (data.event === "error") {
              throw new Error(data.message);
            }
          },
        });
        return options.onFinish(responseText, { metadata: { usage: null } } as any);
      } else {
        const response = await fetch(this.path("chat-messages"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${useAccessStore.getState().vizierApiKey}`,
          },
          body: JSON.stringify(requestPayload),
          signal: controller.signal,
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || "Failed to fetch response");
        }

        const responseJson = await response.json();
        options.onFinish(responseJson.answer, responseJson);
      }
    } catch (e) {
      console.error("Vizier chat error:", e);
      options.onError?.(e as Error);
    }
  }

  async usage() {
    return {
      used: 0,
      total: 0,
    };
  }

  speech(options: SpeechOptions): Promise<ArrayBuffer> {
    throw new Error("Speech not implemented for Vizier");
  }

  async models(): Promise<LLMModel[]> {
    if (this.disableListModels) {
      return [];
    }
    return [];
  }
}