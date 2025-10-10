# Jiki LLM Proxy

A Node.js proxy service for AI-powered translations using Google Gemini. This service handles asynchronous LLM requests from the Jiki Rails API and sends callbacks when processing is complete.

## Overview

The LLM proxy provides a fire-and-forget interface for LLM operations running on port 3064:
1. Rails API sends a request to `/exec`
2. Proxy returns 202 Accepted immediately
3. Proxy calls Gemini API asynchronously
4. Proxy sends callback to Rails SPI endpoint with results

## Architecture

```
Rails API (LLM::Exec)
  → POST to LLM Proxy /exec
  ← 202 Accepted

LLM Proxy
  → Gemini API (streaming)
  ← Response chunks
  → POST to Rails SPI endpoint (callback)
  ← 200 OK
```

## Setup

### Prerequisites

- Node.js 18+
- Yarn
- Redis 5+ (for future streaming features)
- Google Gemini API key

### Environment Variables

```bash
# Required
export GOOGLE_API_KEY="your-gemini-api-key"

# Optional (defaults provided)
export REDIS_URL="redis://127.0.0.1:6379/1"
export PORT="3064"
```

The `spi_base_url` is automatically loaded from `../config/settings/local.yml`.

### Installation

```bash
# Install dependencies
yarn install --frozen-lockfile

# Start the server
./bin/dev
```

Or use npm/yarn directly:

```bash
yarn start
# or
node lib/server.js
```

## Configuration

Configuration is loaded from multiple sources:

1. **Jiki Config Gem** (`../config/settings/local.yml`):
   - `spi_base_url` - Rails SPI callback base URL

2. **Environment Variables**:
   - `GOOGLE_API_KEY` - Gemini API key (required)
   - `REDIS_URL` - Redis connection for streaming
   - `PORT` - Server port (default: 8080)

## API Endpoints

### POST /exec

Execute an LLM request.

**Request Body:**
```json
{
  "service": "gemini",
  "model": "flash",
  "spi_endpoint": "llm/email_translation",
  "stream_channel": "translations:123",
  "prompt": "Translate this...",
  "email_template_id": 42
}
```

**Parameters:**
- `service` (required): Service name - currently only "gemini" is supported
- `model` (required): Model name - "flash" (gemini-1.5-flash) or "pro" (gemini-1.5-pro)
- `spi_endpoint` (required): Rails SPI endpoint for callback (e.g., "llm/email_translation")
- `stream_channel` (optional): Redis stream channel for real-time updates
- `prompt` (required): Prompt text to send to the LLM
- Additional parameters are passed through to the callback

**Response:**
```json
{
  "status": "accepted",
  "message": "Request is being processed. Callback will be sent to the SPI endpoint."
}
```

**Status:** 202 Accepted

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "service": "jiki-llm-proxy"
}
```

## Callback Format

When processing completes, the proxy sends a POST request to `${spi_base_url}${spi_endpoint}`:

**Success Callback:**
```json
{
  "resp": "Full LLM response text",
  "email_template_id": 42
}
```

**Error Callbacks:**

Rate Limited (`/llm/rate_limited`):
```json
{
  "error": "Rate limit exceeded",
  "retry_after": 60,
  "original_params": { ... }
}
```

Error (`/llm/errored`):
```json
{
  "error": "Error message",
  "error_type": "invalid_request",
  "original_params": { ... }
}
```

## Error Handling

The proxy handles several error types:

- **Rate Limiting (429)**: Calls `/llm/rate_limited` with retry information
- **Safety Filters**: Calls `/llm/errored` for content blocked by Gemini safety filters
- **Invalid Requests (400)**: Calls `/llm/errored` for malformed requests
- **Other Errors**: Calls `/llm/errored` with error details

## Testing

### Manual Testing with curl

```bash
# Start the server
./bin/dev

# In another terminal, send a test request
curl -X POST http://localhost:3064/exec \
  -H "Content-Type: application/json" \
  -d '{
    "service": "gemini",
    "model": "flash",
    "spi_endpoint": "llm/email_translation",
    "prompt": "Translate to Hungarian: Hello world",
    "email_template_id": 1
  }'
```

### With Rails Integration

1. Start Redis: `redis-server`
2. Start LLM Proxy: `cd ../llm-proxy && ./bin/dev`
3. Start Rails: `cd ../api && bin/rails server`
4. Test via Rails console or API

## Development

### Project Structure

```
llm-proxy/
├── lib/
│   ├── config.js      # Configuration management
│   ├── gemini.js      # Gemini API integration
│   └── server.js      # Express server
├── bin/
│   └── dev            # Development startup script
├── package.json       # Dependencies
└── README.md          # This file
```

### Code Style

The project uses Prettier for code formatting:

```bash
yarn format
```

### Future Enhancements

- Real-time streaming via Redis and ActionCable
- Support for other LLM providers (OpenAI, Claude, etc.)
- Request queuing and rate limiting
- Retry logic with exponential backoff
- Metrics and monitoring
- Authentication for production use

## Production Deployment

For production deployment:

1. Set environment variables securely
2. Use a process manager (PM2, systemd, Docker)
3. Add authentication/API keys
4. Configure load balancing if needed
5. Set up monitoring and logging
6. Configure Redis for streaming features

## Troubleshooting

### "GOOGLE_API_KEY environment variable is required"

Set your Gemini API key:
```bash
export GOOGLE_API_KEY="your-key-here"
```

### "Could not load config from local.yml"

Make sure you're running from the `jiki/llm-proxy` directory and that `../config/settings/local.yml` exists.

### Callbacks not reaching Rails

1. Check that Rails is running on the expected port
2. Verify `spi_base_url` in `../config/settings/local.yml`
3. Check Rails logs for incoming requests
4. Ensure SPI routes are configured in Rails

## License

MIT
