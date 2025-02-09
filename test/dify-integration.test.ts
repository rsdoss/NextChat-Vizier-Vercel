import { describe, expect, test } from '@jest/globals'
import { sendChatMessage, DifyError } from '@/app/client/platforms/dify'

describe('Dify Integration', () => {
  // This is a real API test - only run when needed
  test.skip('should send a chat message and get response', async () => {
    const request = {
      query: "What is 2+2?",
      user: "test-user-1",
      response_mode: "blocking" as const
    }

    const response = await sendChatMessage(request)
    
    // We expect certain fields to exist in a successful response
    expect(response).toBeDefined()
    expect(response.conversation_id).toBeDefined()
    expect(response.message_id).toBeDefined()
    expect(response.answer).toBeDefined()
    expect(response.metadata).toBeDefined()
  }, 30000) // Increase timeout for API call

  test('should throw error for empty query', async () => {
    const request = {
      query: "",
      user: "test-user-1",
      response_mode: "blocking" as const
    }

    await expect(sendChatMessage(request))
      .rejects
      .toThrow('Query cannot be empty')
  })

  test('should throw DifyError for invalid requests', async () => {
    const request = {
      query: "   ",  // Whitespace only
      user: "test-user-1",
      response_mode: "blocking" as const
    }

    await expect(sendChatMessage(request))
      .rejects
      .toThrow(DifyError)
  })
})