import { describe, it, expect } from "vitest";
import { REDIS_URL, RAILS_SPI_BASE_URL, PORT } from "../src/config.js";

describe("Config", () => {
  describe("Environment Variables", () => {
    it("should load REDIS_URL with default value", () => {
      expect(REDIS_URL).toBe("redis://127.0.0.1:6379/1");
    });

    it("should load RAILS_SPI_BASE_URL with default value", () => {
      expect(RAILS_SPI_BASE_URL).toBe("http://localhost:3000/spi/");
    });

    it("should load PORT as number", () => {
      expect(typeof PORT).toBe("number");
      expect(PORT).toBe(3064);
    });

    it("should have all required config values defined", () => {
      expect(REDIS_URL).toBeDefined();
      expect(RAILS_SPI_BASE_URL).toBeDefined();
      expect(PORT).toBeDefined();
    });
  });
});
