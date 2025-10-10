# LLM Proxy Architecture

## Overview

The Jiki LLM Proxy is a TypeScript/Hono service designed for AWS Lambda that implements a **fire-and-forget** pattern with real-time streaming capabilities. It acts as an asynchronous bridge between the Rails API and LLM providers (currently Google Gemini).

## Core Architecture Pattern

### Fire-and-Forget with Lambda Response Streaming

```
┌──────┐                    ┌────────────┐                    ┌────────┐
│      │  1. POST /exec     │            │  2. Stream API     │        │
│Rails │─────────────────>  │   Lambda   │─────────────────>  │ Gemini │
│ API  │  <202 Accepted>    │   Proxy    │  <chunks...>       │  API   │
│      │  (50ms response)   │            │                    │        │
└──────┘                    └────────────┘                    └────────┘
   ▲                              │                                 │
   │                              │ 3. Publish chunks               │
   │                              ▼                                 │
   │                        ┌──────────┐                            │
   │                        │  Redis   │<───────────────────────────┘
   │ 5. Final callback      │  Pub/Sub │
   │   POST /spi/{endpoint} └──────────┘
   │                              │
   └──────────────────────────────┘ 4. Frontend subscribes
                                       (real-time updates)
```

### Request Flow Timeline

```
0ms:     Rails → POST /exec → Lambda
50ms:    Rails ← 202 Accepted (Rails continues other work!)
100ms:   Lambda → Gemini API (starts streaming)
2000ms:  Lambda → Redis pub/sub (chunk 1: "The answer is...")
2500ms:  Lambda → Redis pub/sub (chunk 2: "based on...")
...
30s:     Lambda → Redis pub/sub (final chunk + done flag)
30.1s:   Lambda → Rails POST /spi/{endpoint} (complete response)
30.2s:   Lambda execution ends
```

**Key Points:**
- Rails gets immediate 202 response and is **completely free** to handle other requests
- Lambda continues execution after returning response (via `streamHandle`)
- Chunks stream to Redis in real-time for frontend consumption
- Final complete response sent via separate HTTP callback to Rails

## Technology Choices

### Why `generateContentStream` over `ai.live.connect`

We use Google Gemini's **standard streaming API** (`ai.models.generateContentStream`) rather than the Live API (`ai.live.connect`) for the following reasons:

#### Cost Comparison (Gemini 2.5 Flash)

| API Type | Input Cost | Output Cost | Use Case |
|----------|-----------|-------------|----------|
| **Standard API** (generateContentStream) | **$0.30**/M tokens | **$2.50**/M tokens | Text generation, translations |
| **Live API** (live.connect) | $0.50/M tokens | $2.00/M tokens | Voice/video conversations |

**Example Cost** (1000 token prompt → 3000 token response):
- Standard API: **$0.0078 per request** ✅
- Live API: $0.0065 per request (but adds WebSocket complexity)

#### Technical Comparison

| Factor | generateContentStream | live.connect | Winner |
|--------|----------------------|--------------|--------|
| **Protocol** | HTTP/REST streaming | WebSocket (stateful) | **generateContentStream** |
| **Direction** | One-way (server → client) | Bidirectional | **generateContentStream** |
| **Lambda Fit** | Request-response | Persistent connection | **generateContentStream** |
| **Complexity** | Simple async iteration | Session management, callbacks | **generateContentStream** |
| **Latency** | ~500ms to first chunk | <100ms to first chunk | live.connect |
| **Modalities** | Text, images | Text, audio, video | (depends on use case) |
| **Interruptions** | No | Yes | (not needed) |

**Verdict:** For **text-only, one-way streaming** (our use case), `generateContentStream` is simpler, more cost-effective for input, and better suited to Lambda's request-response model.

### Why Lambda Response Streaming (`streamHandle`)

Standard Lambda functions freeze execution after returning a response. To support fire-and-forget, we use **Lambda Response Streaming** via Hono's `streamHandle` adapter.

**Without `streamHandle`:**
```typescript
export const handler = handle(app);  // ❌ Lambda freezes after 202
// Background async work may be lost!
```

**With `streamHandle`:**
```typescript
export const handler = streamHandle(app);  // ✅ Lambda waits for async work
// Background processing completes reliably
```

**How it works:**
1. Lambda returns 202 response immediately
2. Lambda execution context stays alive
3. Async IIFE continues running
4. Lambda bills for full duration (e.g., 30 seconds)
5. Lambda terminates only after all async work completes

This is AWS's recommended pattern for "running code after returning a response" (AWS Blog, May 2024).

## Lambda Configuration Requirements

### Function URL Setup

```typescript
// CDK/Terraform/SAM
new lambda.FunctionUrl(this, 'LLMProxyUrl', {
  function: llmProxyFunction,
  invokeMode: lambda.InvokeMode.RESPONSE_STREAM,  // ⚠️ CRITICAL
  cors: {
    allowedOrigins: ['*'],
    allowedMethods: ['POST'],
    allowedHeaders: ['Content-Type']
  }
});
```

**Critical:** The `RESPONSE_STREAM` invoke mode is required for `streamHandle` to work.

### Function Configuration

```typescript
llmProxyFunction.addTimeout(Duration.minutes(15));  // Max Lambda timeout
llmProxyFunction.addMemorySize(1024);  // Sufficient for SDK + Redis
llmProxyFunction.addEnvironment({
  GOOGLE_API_KEY: secrets.geminiApiKey,
  REDIS_URL: 'redis://your-redis-url:6379/1',
  RAILS_SPI_BASE_URL: 'https://your-rails-api.com/spi/'
});
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GOOGLE_API_KEY` | ✅ Yes | - | Gemini API key |
| `RAILS_SPI_BASE_URL` | ✅ Yes | `http://localhost:3000/spi/` | Rails callback base URL |
| `REDIS_URL` | No | `redis://127.0.0.1:6379/1` | Redis for streaming |
| `PORT` | No | `3064` | Server port (local dev only) |

**Configuration is managed via:**
- **Local Development**: `.env` file (copy from `.env.example`)
- **Lambda Production**: Lambda environment variables

## Error Handling

### Error Types

The service handles three main error types:

1. **Rate Limiting (429)** → Calls `/llm/rate_limited` callback
2. **Invalid Request (400/403/404)** → Calls `/llm/errored` callback
3. **Safety Filters (SAFETY)** → Calls `/llm/errored` callback
4. **Unknown Errors** → Calls `/llm/errored` callback

### Error Recovery

```typescript
// If error occurs during processing
catch (error) {
  if (error instanceof RateLimitException) {
    await callErrorHandler('rate_limited', {
      error: error.message,
      retry_after: error.retryAfter,
      original_params: { ... }
    });
  } else {
    await callErrorHandler('errored', {
      error: error.message,
      error_type: 'invalid_request',
      original_params: { ... }
    });
  }
}
```

**Note:** If the error callback itself fails, the error is logged but the request is lost. Consider implementing a dead letter queue (DLQ) for production reliability.

## Local Development vs Production

### Local Development
```bash
# Uses Node.js HTTP server
pnpm dev
# Server starts on http://localhost:3064
```

The code detects non-Lambda environment and starts a traditional HTTP server:
```typescript
if (!process.env.AWS_EXECUTION_ENV && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
  serve({ fetch: app.fetch, port: PORT });
}
```

### Lambda Production
```bash
# Build for Lambda
pnpm build

# Deploy (example with AWS SAM)
sam deploy --guided
```

Lambda uses the exported `handler`:
```typescript
export const handler = streamHandle(app);
```

## Redis Streaming Protocol

### Chunk Format

```typescript
// During streaming
redis.publish(stream_channel, JSON.stringify({
  text: "chunk of response text",
  done: false
}));

// Final message
redis.publish(stream_channel, JSON.stringify({
  text: null,
  done: true
}));
```

### Frontend Integration

Frontend subscribes to the Redis channel and displays chunks in real-time:

```typescript
// Frontend (conceptual)
const redis = new Redis(REDIS_URL);
redis.subscribe(stream_channel);

redis.on('message', (channel, message) => {
  const { text, done } = JSON.parse(message);
  if (text) displayChunk(text);
  if (done) finishLoading();
});
```

## Alternative Architectures Considered

### Option 1: SQS Queue + Worker Lambda

**Pattern:**
```
Rails → API Lambda → SQS → Worker Lambda → Gemini
                              ↓
                           Redis + Callback
```

**Pros:**
- API returns in ~10ms (just queuing)
- Better separation of concerns
- Natural retry mechanism via SQS

**Cons:**
- More infrastructure complexity
- Higher cost (Lambda + SQS + DLQ)
- Two Lambda functions to maintain

**Decision:** Not needed for current scale. `streamHandle` provides sufficient performance.

### Option 2: Await Completion (Exercism Pattern)

**Pattern:**
```typescript
res.status(202).json({ status: 'accepted' });
await handleGeminiPrompt(...);  // Block until complete
```

**Pros:**
- Simpler (no fire-and-forget)
- Guaranteed completion

**Cons:**
- Client connection stays open for 30+ seconds
- Higher Lambda cost (blocking execution time)
- Poor UX (client waits)

**Decision:** Fire-and-forget with `streamHandle` provides better UX and efficiency.

## Monitoring and Observability

### Current State
- Console logging only
- No structured logs
- No metrics/tracing

### Recommended Production Additions
1. **Structured Logging**: Use Winston/Pino with JSON format
2. **Distributed Tracing**: AWS X-Ray integration
3. **Metrics**: CloudWatch custom metrics (request count, duration, errors)
4. **Alerting**: SNS notifications for error rate thresholds
5. **Dead Letter Queue**: SQS DLQ for failed callbacks

## Performance Characteristics

### Latency
- Rails receives 202: **~50ms**
- First Redis chunk: **~2 seconds** (includes Gemini cold start)
- Subsequent chunks: **~500ms intervals**
- Final callback: **~30 seconds** (for typical translation)

### Costs (per request)
- Lambda execution: ~$0.0001 (30s at 1024MB)
- Gemini API: ~$0.0078 (1K input, 3K output)
- Redis: Negligible (pub/sub)
- **Total: ~$0.008 per request**

### Limits
- Lambda timeout: 15 minutes max
- Gemini context: 1M tokens (Gemini 1.5)
- Redis message size: 512MB max

## Security Considerations

### Current State
- `spi_endpoint` is user-controlled (potential SSRF)
- No request authentication
- No rate limiting

### Recommended Production Additions
1. **Validate callback URLs**: Whitelist allowed SPI endpoints
2. **Add request signing**: HMAC signature verification
3. **Implement rate limiting**: Per-client request throttling
4. **Use VPC endpoints**: Keep Redis and Rails traffic private

## References

- [AWS Lambda Response Streaming Blog](https://aws.amazon.com/blogs/compute/running-code-after-returning-a-response-from-an-aws-lambda-function/)
- [Hono AWS Lambda Adapter](https://hono.dev/docs/getting-started/aws-lambda)
- [Google Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Google GenAI SDK Docs](https://googleapis.github.io/js-genai/)
