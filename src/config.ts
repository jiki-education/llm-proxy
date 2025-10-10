// Configuration loaded from environment variables

// Redis URL for streaming
export const REDIS_URL = process.env.REDIS_URL ?? "redis://127.0.0.1:6379/1";

// Rails SPI base URL - must be set via environment variable
export const RAILS_SPI_BASE_URL = process.env.RAILS_SPI_BASE_URL ?? "http://localhost:3000/spi/";

// Gemini API key from environment
export const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY ?? "";

// Server port
export const PORT = parseInt(process.env.PORT ?? "3064", 10);

// Validate required configuration
export function validateConfig(): void {
  if (!GOOGLE_API_KEY) {
    throw new Error("GOOGLE_API_KEY environment variable is required");
  }

  if (!RAILS_SPI_BASE_URL) {
    throw new Error("RAILS_SPI_BASE_URL must be set (via env var or YAML config)");
  }

  console.log("Configuration loaded successfully:");
  console.log("  RAILS_SPI_BASE_URL:", RAILS_SPI_BASE_URL);
  console.log("  REDIS_URL:", REDIS_URL);
  console.log("  PORT:", PORT);
  console.log("  GOOGLE_API_KEY:", GOOGLE_API_KEY ? "***" + GOOGLE_API_KEY.slice(-4) : "not set");
}
