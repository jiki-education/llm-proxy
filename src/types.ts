// Request/Response Types
export interface ExecRequest {
  service: string;
  model: string;
  spi_endpoint: string;
  stream_channel?: string;
  prompt: string;
  [key: string]: unknown; // Additional parameters passed through to callback
}

export interface ExecResponse {
  status: string;
  message: string;
}

export interface HealthResponse {
  status: string;
  service: string;
}

// Callback Types
export interface SuccessCallbackPayload {
  resp: string;
  [key: string]: unknown; // Additional params from request
}

export interface ErrorCallbackPayload {
  error: string;
  error_type?: string;
  retry_after?: number;
  original_params: Record<string, unknown>;
}

// Config Types
export interface Config {
  REDIS_URL: string;
  RAILS_SPI_BASE_URL: string;
  GOOGLE_API_KEY: string;
  PORT: number;
}

// Custom Exception Types
export class RateLimitException extends Error {
  retryAfter: number | null;

  constructor(message: string, retryAfter: number | null = null) {
    super(message);
    this.name = "RateLimitException";
    this.retryAfter = retryAfter;
  }
}

export class InvalidRequestException extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidRequestException";
  }
}

// Model Types
export type ModelName = "flash" | "pro";

export interface ModelMap {
  [key: string]: string;
}
