import { readFileSync } from "fs";
import { parse } from "yaml";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load configuration from Jiki config gem settings
function loadConfigFromYaml(): Record<string, unknown> {
  try {
    const configPath = join(__dirname, "../../config/settings/local.yml");
    const fileContents = readFileSync(configPath, "utf8");
    const config = parse(fileContents);
    return config as Record<string, unknown>;
  } catch (error) {
    console.warn("Warning: Could not load config from local.yml:", (error as Error).message);
    return {};
  }
}

const config = loadConfigFromYaml();

// Rails SPI base URL loaded from config gem settings
export const RAILS_SPI_BASE_URL = (config.spi_base_url as string) || "http://localhost:3000/spi/";

// Gemini API key from environment
export const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY ?? "";

// Server port
export const PORT = parseInt(process.env.PORT ?? "3064", 10);

// Validate required configuration
export function validateConfig(): void {
  if (!GOOGLE_API_KEY) {
    throw new Error("GOOGLE_API_KEY environment variable is required");
  }

  console.log("Configuration loaded successfully:");
  console.log("  RAILS_SPI_BASE_URL:", RAILS_SPI_BASE_URL);
  console.log("  PORT:", PORT);
  console.log("  GOOGLE_API_KEY:", GOOGLE_API_KEY ? "***" + GOOGLE_API_KEY.slice(-4) : "not set");
}
