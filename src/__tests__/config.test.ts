import { describe, it, expect, beforeEach, afterEach } from "vitest";

describe("Config", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment before each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe("Environment Variables", () => {
    it("should load GOOGLE_API_KEY from environment", async () => {
      process.env.GOOGLE_API_KEY = "test-api-key";

      // Re-import to get fresh config
      const { GOOGLE_API_KEY } = await import("../config.js");

      expect(GOOGLE_API_KEY).toBe("test-api-key");
    });

    it("should default REDIS_URL when not set", async () => {
      delete process.env.REDIS_URL;

      const { REDIS_URL } = await import("../config.js");

      expect(REDIS_URL).toBe("redis://127.0.0.1:6379/1");
    });

    it("should default RAILS_SPI_BASE_URL when not set", async () => {
      delete process.env.RAILS_SPI_BASE_URL;

      const { RAILS_SPI_BASE_URL } = await import("../config.js");

      expect(RAILS_SPI_BASE_URL).toBe("http://localhost:3000/spi/");
    });

    it("should use custom RAILS_SPI_BASE_URL when set", async () => {
      process.env.RAILS_SPI_BASE_URL = "https://api.example.com/spi/";

      const { RAILS_SPI_BASE_URL } = await import("../config.js");

      expect(RAILS_SPI_BASE_URL).toBe("https://api.example.com/spi/");
    });

    it("should default PORT to 3064", async () => {
      delete process.env.PORT;

      const { PORT } = await import("../config.js");

      expect(PORT).toBe(3064);
    });

    it("should parse PORT as integer", async () => {
      process.env.PORT = "8080";

      const { PORT } = await import("../config.js");

      expect(PORT).toBe(8080);
      expect(typeof PORT).toBe("number");
    });
  });

  describe("validateConfig", () => {
    it("should throw error when GOOGLE_API_KEY is missing", async () => {
      delete process.env.GOOGLE_API_KEY;

      const { validateConfig } = await import("../config.js");

      expect(() => validateConfig()).toThrow("GOOGLE_API_KEY environment variable is required");
    });

    it("should throw error when GOOGLE_API_KEY is empty string", async () => {
      process.env.GOOGLE_API_KEY = "";

      const { validateConfig } = await import("../config.js");

      expect(() => validateConfig()).toThrow("GOOGLE_API_KEY environment variable is required");
    });

    it("should throw error when RAILS_SPI_BASE_URL is empty", async () => {
      process.env.GOOGLE_API_KEY = "test-key";
      process.env.RAILS_SPI_BASE_URL = "";

      const { validateConfig } = await import("../config.js");

      expect(() => validateConfig()).toThrow("RAILS_SPI_BASE_URL must be set");
    });

    it("should not throw when all required config is present", async () => {
      process.env.GOOGLE_API_KEY = "test-key";
      process.env.RAILS_SPI_BASE_URL = "http://localhost:3000/spi/";

      const { validateConfig } = await import("../config.js");

      expect(() => validateConfig()).not.toThrow();
    });
  });
});
