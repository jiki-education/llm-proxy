import { describe, it, expect } from "vitest";
import { RateLimitException, InvalidRequestException } from "../types.js";

describe("Custom Exception Types", () => {
  describe("RateLimitException", () => {
    it("should create exception with message", () => {
      const error = new RateLimitException("Rate limit exceeded");

      expect(error.name).toBe("RateLimitException");
      expect(error.message).toBe("Rate limit exceeded");
      expect(error.retryAfter).toBeNull();
    });

    it("should create exception with retry after value", () => {
      const error = new RateLimitException("Rate limit exceeded", 60);

      expect(error.name).toBe("RateLimitException");
      expect(error.message).toBe("Rate limit exceeded");
      expect(error.retryAfter).toBe(60);
    });

    it("should be instanceof Error", () => {
      const error = new RateLimitException("Test");

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(RateLimitException);
    });
  });

  describe("InvalidRequestException", () => {
    it("should create exception with message", () => {
      const error = new InvalidRequestException("Invalid request");

      expect(error.name).toBe("InvalidRequestException");
      expect(error.message).toBe("Invalid request");
    });

    it("should be instanceof Error", () => {
      const error = new InvalidRequestException("Test");

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(InvalidRequestException);
    });
  });
});
