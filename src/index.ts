import "dotenv/config";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { streamHandle } from "hono/aws-lambda";
import { handleGeminiPrompt } from "./gemini.js";
import { validateConfig, PORT, RAILS_SPI_BASE_URL } from "./config.js";
import { RateLimitException, InvalidRequestException, type ExecRequest } from "./types.js";

// Validate configuration on startup
try {
  validateConfig();
} catch (error) {
  console.error("Configuration error:", (error as Error).message);
  process.exit(1);
}

const app = new Hono();

// Health check endpoint
app.get("/health", (c) => {
  return c.json({ status: "ok", service: "jiki-llm-proxy" });
});

// Main execution endpoint
app.post("/exec", async (c) => {
  const body = await c.req.json<ExecRequest>();
  const { service, model, spi_endpoint, stream_channel, prompt, ...additionalParams } = body;

  // Validate required parameters
  if (!service) {
    return c.json({ error: "Missing required parameter: service" }, 400);
  }
  if (!model) {
    return c.json({ error: "Missing required parameter: model" }, 400);
  }
  if (!spi_endpoint) {
    return c.json({ error: "Missing required parameter: spi_endpoint" }, 400);
  }
  if (!prompt) {
    return c.json({ error: "Missing required parameter: prompt" }, 400);
  }

  // Only support Gemini for now
  if (service !== "gemini") {
    return c.json({ error: `Unsupported service: ${service}` }, 400);
  }

  console.log(`[${new Date().toISOString()}] New request: ${service}/${model} -> ${spi_endpoint}`);

  // Return 202 Accepted immediately (fire-and-forget)
  const response = c.json(
    {
      status: "accepted",
      message: "Request is being processed. Callback will be sent to the SPI endpoint."
    },
    202
  );

  // Process asynchronously (don't await)
  void (async () => {
    try {
      await handleGeminiPrompt(model, spi_endpoint, stream_channel, prompt, additionalParams);
      console.warn(`[${new Date().toISOString()}] Request completed successfully`);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Request failed:`, error);

      // Call error handlers on Rails side
      if (error instanceof RateLimitException) {
        await callErrorHandler("rate_limited", {
          error: error.message,
          retry_after: error.retryAfter,
          original_params: { service, model, spi_endpoint, stream_channel, ...additionalParams }
        });
      } else if (error instanceof InvalidRequestException) {
        await callErrorHandler("errored", {
          error: error.message,
          error_type: "invalid_request",
          original_params: { service, model, spi_endpoint, stream_channel, ...additionalParams }
        });
      } else {
        await callErrorHandler("errored", {
          error: (error as Error).message,
          error_type: "unknown",
          original_params: { service, model, spi_endpoint, stream_channel, ...additionalParams }
        });
      }
    }
  })();

  return response;
});

// Helper function to call error handlers
async function callErrorHandler(handler: string, payload: Record<string, unknown>): Promise<void> {
  try {
    const url = `${RAILS_SPI_BASE_URL}llm/${handler}`;
    console.log(`Calling error handler: ${url}`);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      console.error(`Error handler ${handler} failed with status ${response.status}`);
    }
  } catch (error) {
    console.error(`Failed to call error handler ${handler}:`, (error as Error).message);
  }
}

// Export Lambda handler with streaming support
// This allows Lambda to keep execution alive after returning 202 response
export const handler = streamHandle(app);

// Start server only in non-Lambda environments (local development)
if (!process.env.AWS_EXECUTION_ENV && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
  console.log(`\n=================================`);
  console.log(`Jiki LLM Proxy Server`);
  console.log(`=================================`);
  console.log(`Server running on port ${PORT}`);
  console.log(`Callback base URL: ${RAILS_SPI_BASE_URL}`);
  console.log(`=================================\n`);

  serve({
    fetch: app.fetch,
    port: PORT
  });

  // Graceful shutdown
  process.on("SIGTERM", () => {
    console.log("SIGTERM received, shutting down gracefully...");
    process.exit(0);
  });
}
