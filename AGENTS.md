# AGENTS.md

This file provides guidance to Agents (e.g. Claude Code) when working with code in this repository.

## Project Context

This is the Jiki LLM Proxy - a TypeScript/Hono service that handles asynchronous LLM requests from the Jiki Rails API. It acts as a fire-and-forget proxy that:

1. Accepts requests from the Rails API
2. Calls the Gemini API with streaming
3. Sends callbacks to Rails SPI endpoints when complete

## Related Repositories

This repo is part of a set of repos:

- **API** (`../api`) - Rails backend that calls this proxy
- **Frontend** (`../front-end`) - React/Next.js application
- **Overview** (`../overview`) - Business requirements and system design
- **Config** (`../config`) - Shared configuration (Jiki config gem)

## Tech Stack

- **Runtime**: Node.js 18+
- **Language**: TypeScript
- **Framework**: Hono (Lambda-ready, lightweight alternative to Express)
- **Package Manager**: pnpm
- **LLM**: Google Gemini API
- **Deployment Target**: AWS Lambda

## Development

### Setup

```bash
cp .env.example .env
# Add your GOOGLE_API_KEY to .env
pnpm install
```

### Running

```bash
pnpm dev          # Development with tsx (direct TS execution)
pnpm build        # Build for production
pnpm start        # Run production build
```

### Code Quality

```bash
pnpm lint         # Run ESLint
pnpm format       # Format with Prettier
pnpm format:check # Check formatting
pnpm typecheck    # TypeScript type checking
pnpm test         # Run tests (when implemented)
```

## Before Committing

Always perform these checks before committing code:

1. **Type Check**: `pnpm typecheck`
2. **Run Linting**: `pnpm lint`
3. **Check Formatting**: `pnpm format:check` (or run `pnpm format` to fix)
4. **Run Tests**: `pnpm test` (when tests are added)
5. **Commit Message**: Use clear, descriptive commit messages that explain the "why"

## Git Workflow for Agents

**REQUIRED**: When completing any task, agents MUST follow this workflow:

1. **Create Feature Branch**: Always work on a descriptively named feature branch (e.g., `add-claude-support`, `fix-error-handling`)
2. **Implement Changes**: Make all necessary code and documentation changes
3. **Quality Checks**: Run typecheck, linting, and formatting checks
4. **Commit Changes**: Create a clear, descriptive commit message
5. **Push Branch**: Push the feature branch to the remote repository
6. **Create Pull Request**: Always create a PR with a comprehensive description of changes

This ensures proper code review, maintains git history, and follows professional development practices.

## Architecture Notes

For detailed architectural documentation, see `.context/architecture.md`.

### Fire-and-Forget Pattern with Lambda Response Streaming

- POST to `/exec` returns 202 Accepted immediately (~50ms)
- Rails can continue processing other requests immediately
- Lambda continues executing async work after returning response
- Request is processed asynchronously with real-time Redis streaming
- Callback sent to Rails SPI endpoint when complete or on error

**Key Implementation Details:**

- Uses `streamHandle` from `hono/aws-lambda` to keep Lambda alive after response
- Chunks stream to Redis pub/sub in real-time for frontend consumption
- Lambda waits for all async work to complete before terminating
- Works both locally (Node server) and on Lambda (response streaming)

### Streaming Architecture

1. **Rails → Lambda**: POST request with prompt and parameters
2. **Lambda → Rails**: Immediate 202 Accepted response
3. **Lambda → Gemini**: Stream API call with `generateContentStream`
4. **Gemini → Redis**: Real-time chunk publishing via Redis pub/sub
5. **Lambda → Rails**: Final callback with complete response

### Error Handling

- Rate limiting (429) → `/llm/rate_limited` callback
- Invalid requests (400/403/404) → `/llm/errored` callback
- Safety filters (SAFETY) → `/llm/errored` callback
- Other errors → `/llm/errored` callback

### Configuration

All configuration is managed via environment variables:

- **Local Development**: Use `.env` file (copy from `.env.example`)
- **Lambda Production**: Set environment variables in Lambda configuration

**Required Variables:**

- `GOOGLE_API_KEY` - Gemini API key
- `RAILS_SPI_BASE_URL` - Base URL for Rails SPI callbacks

**Optional Variables:**

- `REDIS_URL` - Redis connection string (defaults to `redis://127.0.0.1:6379/1`)
- `PORT` - Server port for local development (defaults to 3064)

### Type Safety

- All functions and interfaces fully typed
- Custom exception classes (`RateLimitException`, `InvalidRequestException`)
- Request/response type definitions in `src/types.ts`

## Deployment

This service is designed to run on AWS Lambda with **response streaming** enabled.

### Critical Lambda Configuration

**⚠️ REQUIRED:** Lambda Function URL must be configured with `RESPONSE_STREAM` invoke mode:

```typescript
// CDK/Terraform/SAM example
new lambda.FunctionUrl(this, "LLMProxyUrl", {
  function: llmProxyFunction,
  invokeMode: lambda.InvokeMode.RESPONSE_STREAM, // ⚠️ CRITICAL
  cors: {
    allowedOrigins: ["*"],
    allowedMethods: ["POST"],
    allowedHeaders: ["Content-Type"]
  }
});
```

**Why this is required:** The `streamHandle` adapter keeps Lambda execution alive after returning the 202 response, allowing async work to complete. Without `RESPONSE_STREAM` mode, Lambda will freeze execution and background work will be lost.

### Lambda Function Configuration

```typescript
llmProxyFunction.addTimeout(Duration.minutes(15)); // Max Lambda timeout
llmProxyFunction.addMemorySize(1024); // Sufficient for SDK + Redis
```

### Environment Variables (Lambda)

**Required:**

- `GOOGLE_API_KEY` - Gemini API key
- `RAILS_SPI_BASE_URL` - Base URL for Rails SPI callbacks (e.g., `https://api.jiki.io/spi/`)

**Optional:**

- `REDIS_URL` - Redis connection string (defaults to `redis://127.0.0.1:6379/1`)
- `PORT` - Server port for local development only (defaults to 3064)

### Local vs Lambda Behavior

The service automatically detects its environment:

**Local Development:**

- Starts HTTP server on port 3064
- Reads configuration from `.env` file
- Full streaming and Redis support

**Lambda Production:**

- Exports `handler` function using `streamHandle`
- Skips server startup (no HTTP listener)
- Uses Lambda environment variables

### Build and Deploy

```bash
# Build for production
pnpm build

# Deploy with AWS SAM (example)
sam build
sam deploy --guided

# Or with CDK/Terraform/etc.
```

## Future Enhancements

- Add test suite (unit + integration tests)
- ~~Real-time streaming via Redis/WebSockets~~ ✅ Implemented
- Support for additional LLM providers (OpenAI, Claude, etc.)
- Request queuing and rate limiting
- Retry logic with exponential backoff
- Metrics and monitoring (CloudWatch, X-Ray)
- Dead letter queue for failed callbacks
