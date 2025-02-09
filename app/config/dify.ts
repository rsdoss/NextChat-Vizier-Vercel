export const DifyConfig = {
  baseUrl: process.env.NEXT_PUBLIC_DIFY_BASE_URL || "https://api.dify.ai/v1",
  apiKey: process.env.DIFY_API_KEY || "app-esoEpCx3X7RVYBDdYR1Hc6bO",
}

// Validate config
if (!DifyConfig.apiKey) {
  console.warn('DIFY_API_KEY is not set in environment variables')
}

if (!DifyConfig.baseUrl) {
  console.warn('NEXT_PUBLIC_DIFY_BASE_URL is not set in environment variables')
}