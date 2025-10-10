import { GoogleGenerativeAI } from '@google/generative-ai';
import fetch from 'node-fetch';
import { GOOGLE_API_KEY, RAILS_SPI_BASE_URL } from './config.js';
import { RateLimitException, InvalidRequestException, type ModelMap } from './types.js';

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);

// Model mapping
const MODEL_MAP: ModelMap = {
  flash: 'gemini-1.5-flash',
  pro: 'gemini-1.5-pro'
};

/**
 * Handle Gemini prompt with streaming and callback
 * @param modelName - Model name (flash, pro)
 * @param spiEndpoint - SPI endpoint for callback (e.g., 'email_translation')
 * @param streamChannel - Redis stream channel (optional, for future use)
 * @param prompt - Prompt text
 * @param params - Additional parameters (e.g., email_template_id)
 */
export async function handleGeminiPrompt(
  modelName: string,
  spiEndpoint: string,
  streamChannel: string | undefined,
  prompt: string,
  params: Record<string, unknown> = {}
): Promise<{ success: boolean; response: string }> {
  try {
    // Get the appropriate model
    const modelId = MODEL_MAP[modelName] || MODEL_MAP.flash;
    const model = genAI.getGenerativeModel({ model: modelId });

    console.log(`Starting Gemini request with model: ${modelId}`);
    console.log(`Callback endpoint: ${spiEndpoint}`);
    console.log(`Prompt length: ${prompt.length} characters`);

    // Generate content with streaming
    const result = await model.generateContentStream(prompt);

    let fullResponse = '';

    // Process stream chunks
    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      fullResponse += chunkText;

      // Future: Publish to Redis stream for real-time updates
      // if (redisClient && streamChannel) {
      //   await redisClient.xadd(streamChannel, '*', 'chunk', chunkText);
      // }
    }

    console.log(`Gemini response received: ${fullResponse.length} characters`);

    // Send callback to Rails SPI endpoint
    const callbackUrl = `${RAILS_SPI_BASE_URL}${spiEndpoint}`;
    console.log(`Sending callback to: ${callbackUrl}`);

    const callbackPayload = {
      resp: fullResponse,
      ...params
    };

    const response = await fetch(callbackUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(callbackPayload)
    });

    if (!response.ok) {
      console.error(`Callback failed with status ${response.status}: ${await response.text()}`);
      throw new Error(`Callback to ${callbackUrl} failed with status ${response.status}`);
    }

    console.log(`Callback successful (${response.status})`);

    return { success: true, response: fullResponse };

  } catch (error) {
    console.error('Gemini prompt handling error:', error);

    const errorMessage = (error as Error).message;

    // Handle rate limiting
    if (errorMessage && errorMessage.includes('429')) {
      const retryAfter = 60; // Default to 60 seconds
      throw new RateLimitException('Rate limit exceeded', retryAfter);
    }

    // Handle safety/blocked content
    if (errorMessage && (errorMessage.includes('SAFETY') || errorMessage.includes('blocked'))) {
      throw new InvalidRequestException('Content was blocked by safety filters');
    }

    // Handle invalid requests
    if (errorMessage && errorMessage.includes('400')) {
      throw new InvalidRequestException(`Invalid request: ${errorMessage}`);
    }

    // Re-throw other errors
    throw error;
  }
}
