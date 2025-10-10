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

### Fire-and-Forget Pattern

- POST to `/exec` returns 202 Accepted immediately
- Request is processed asynchronously
- Callback sent to Rails SPI endpoint when complete or on error

### Error Handling

- Rate limiting (429) → `/llm/rate_limited` callback
- Safety filters/blocked content → `/llm/errored` callback
- Other errors → `/llm/errored` callback

### Configuration

- Environment variables via `.env` (local) or Lambda env vars (production)
- Rails SPI base URL loaded from `../config/settings/local.yml`
- Gemini API key from `GOOGLE_API_KEY` env var

### Type Safety

- All functions and interfaces fully typed
- Custom exception classes (`RateLimitException`, `InvalidRequestException`)
- Request/response type definitions in `src/types.ts`

## Deployment

This service is designed to run on AWS Lambda. The Hono framework provides native Lambda support with zero configuration needed.

### Environment Variables (Lambda)

- `GOOGLE_API_KEY` - Gemini API key
- `PORT` - Server port (optional, defaults to 3064)

## Future Enhancements

- Add test suite (unit + integration tests)
- Real-time streaming via Redis/WebSockets
- Support for additional LLM providers (OpenAI, Claude, etc.)
- Request queuing and rate limiting
- Retry logic with exponential backoff
- Metrics and monitoring
