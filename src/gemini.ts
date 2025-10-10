import { GoogleGenAI } from "@google/genai";
import Redis from "ioredis";
import fetch from "node-fetch";
import { GOOGLE_API_KEY, REDIS_URL, RAILS_SPI_BASE_URL } from "./config.js";
import { RateLimitException, InvalidRequestException, type ModelMap } from "./types.js";

// Initialize Redis client for streaming
let redisClient: Redis | null = null;
try {
  redisClient = new Redis(REDIS_URL);
  redisClient.on("error", (err) => {
    console.warn("Redis connection error:", err.message);
  });
} catch (error) {
  console.warn("Could not initialize Redis client:", (error as Error).message);
}

// Initialize Gemini AI
const ai = new GoogleGenAI({ apiKey: GOOGLE_API_KEY });

// Model mapping
const MODEL_MAP: ModelMap = {
  flash: "gemini-1.5-flash",
  pro: "gemini-1.5-pro"
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

    console.log(`Starting Gemini request with model: ${modelId}`);
    console.log(`Callback endpoint: ${spiEndpoint}`);
    console.log(`Prompt length: ${prompt.length} characters`);

    // Generate content with streaming
    const stream = await ai.models.generateContentStream({
      model: modelId,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        thinkingConfig: {
          thinkingBudget: 0
        }
      }
    });

    let fullResponse = "";

    // Process stream chunks
    for await (const chunk of stream) {
      const chunkText = chunk.text;
      fullResponse += chunkText;

      // Publish to Redis stream for real-time updates
      if (redisClient !== null && streamChannel !== undefined && streamChannel !== "") {
        try {
          await redisClient.publish(
            streamChannel,
            JSON.stringify({
              text: chunkText,
              done: false
            })
          );
        } catch (error) {
          console.warn("Redis stream publish failed:", (error as Error).message);
        }
      }
    }

    console.log(`Gemini response received: ${fullResponse.length} characters`);

    // Publish final message with done flag
    if (redisClient !== null && streamChannel !== undefined && streamChannel !== "") {
      try {
        await redisClient.publish(
          streamChannel,
          JSON.stringify({
            text: null,
            done: true
          })
        );
      } catch (error) {
        console.warn("Redis stream publish failed:", (error as Error).message);
      }
    }

    // Send callback to Rails SPI endpoint
    const callbackUrl = `${RAILS_SPI_BASE_URL}${spiEndpoint}`;
    console.log(`Sending callback to: ${callbackUrl}`);

    const callbackPayload = {
      resp: fullResponse,
      ...params
    };

    const response = await fetch(callbackUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(callbackPayload)
    });

    if (!response.ok) {
      console.error(`Callback failed with status ${response.status}: ${await response.text()}`);
      throw new Error(`Callback to ${callbackUrl} failed with status ${response.status}`);
    }

    console.log(`Callback successful (${response.status})`);

    return { success: true, response: fullResponse };
  } catch (err: unknown) {
    const error = err as { code?: number; message?: string };
    const errorMessage = error.message ?? "";

    if (error.code === 400) {
      console.log("Bad request:", errorMessage);
      throw new InvalidRequestException("Bad request: " + errorMessage);
    } else if (error.code === 403) {
      console.log("Access forbidden:", errorMessage);
      throw new InvalidRequestException("Access forbidden: " + errorMessage);
    } else if (error.code === 404) {
      console.log("Model not found:", errorMessage);
      throw new InvalidRequestException("Model not found: " + errorMessage);
    } else if (error.code === 429) {
      console.warn("Rate limit exceeded. Retrying in 1 second...");
      throw new RateLimitException("Rate limit exceeded", null);
    } else if (errorMessage.includes("SAFETY")) {
      console.log("Safety settings triggered");
      throw new InvalidRequestException("Safety settings triggered");
    } else {
      console.error("Unexpected error:", err);
      throw new InvalidRequestException("Unexpected error: " + (errorMessage || "Unknown error"));
    }
  }
}

// Cleanup Redis connection on process exit
process.on("SIGINT", () => {
  if (redisClient) {
    void redisClient.quit();
  }
  process.exit(0);
});
