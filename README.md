# lognerve.ai TypeScript SDK

Trace your LLM applications with minimal setup. Captures spans for every LLM call, tool execution, and agent step — automatically or manually — and exports them to any OpenTelemetry-compatible backend.

---

## Installation

```bash
npm install lognerve.ai-typescript-sdk
```

---

## Quick Start

```typescript
import { LogNerve, Context } from "lognerve.ai-typescript-sdk";

LogNerve.initialize();

// wrap any async function in a span
const result = await Context.observe({ name: "my_task", type: "agent" }, async () => {
  return "done";
});

await LogNerve.flush();
await LogNerve.shutdown();
```

---

## Configuration

Pass options directly or set environment variables — env vars are the default, direct options override them.

```typescript
LogNerve.initialize({
  projectName: "my-project",
  serviceName: "my-service",
  environment: "production",       // "local" | "production"
  exporter: "otlp-http",           // "console" | "otlp-http"
  otlpEndpoint: "https://...",
  otlpHeaders: { Authorization: "Bearer ..." },
  batchExport: true,               // use BatchSpanProcessor (recommended for production)
  instrumentations: ["openai"],    // auto-instrument libraries
});
```

### Environment Variables

| Variable | Description |
|---|---|
| `LOGNERVE_PROJECT_NAME` | Project name attached to all spans |
| `LOGNERVE_SERVICE_NAME` | Service name for the resource |
| `LOGNERVE_ENVIRONMENT` | `local` or `production` |
| `LOGNERVE_EXPORTER` | `console` or `otlp-http` |
| `LOGNERVE_OTLP_ENDPOINT` | OTLP collector URL |
| `LOGNERVE_OTLP_HEADERS` | Headers as `key1=value1,key2=value2` |
| `LOGNERVE_INSTRUMENTATIONS` | Comma-separated: `openai`, `anthropic` |

---

## Auto-Instrumentation

Pass the library name to `instrumentations` and all calls are traced automatically — no code changes needed.

```typescript
LogNerve.initialize({ instrumentations: ["openai"] });

// IMPORTANT: require the library AFTER initialize()
const { default: OpenAI } = require("openai");
const openai = new OpenAI();

// this call is now traced automatically
const response = await openai.chat.completions.create({ ... });
```

Supported: `openai`, `anthropic`

---

## Manual Tracing with `Context.observe()`

Wrap any async function to create a span. Arguments are captured as input, return value as output.

```typescript
const answer = await Context.observe(
  { name: "agent_turn", type: "agent" },
  async (question: string) => {
    return askLLM(question);
  },
  "What is the weather in Tokyo?"
);
```

Nested `observe()` calls automatically become child spans — no parent wiring needed.

```typescript
await Context.observe({ name: "pipeline", type: "agent" }, async () => {
  await Context.observe({ name: "fetch_data", type: "tool" }, async () => { ... });
  await Context.observe({ name: "summarize",  type: "llm"  }, async () => { ... });
});
```

### Options

| Option | Type | Description |
|---|---|---|
| `name` | `string` | Span name |
| `type` | `"agent" \| "tool" \| "llm" \| "chain"` | Span kind |
| `captureInput` | `boolean` | Capture function args (default `true`) |
| `captureOutput` | `boolean` | Capture return value (default `true`) |
| `sessionId` | `string` | Session ID on this span |
| `userId` | `string` | User ID on this span |
| `metadata` | `object` | Arbitrary metadata |
| `tags` | `string[]` | Tags |

---

## Session and User Context

Use `usingAttributes()` to attach session and user info to all spans inside a block, including auto-instrumented LLM calls.

```typescript
await Context.usingAttributes(
  { sessionId: "session-123", userId: "user-456", tags: ["prod"] },
  async () => {
    // every span created here carries sessionId and userId
    await runAgent();
  }
);
```

---

## Setting Attributes on the Active Span

Call these anywhere inside an `observe()` block to annotate the current span.

```typescript
// LLM-specific attributes
Context.setAttributes({
  model: "gpt-4o",
  modelParams: { temperature: 0.7 },
  usage: { prompt_tokens: 120, completion_tokens: 80 },
  input: "user question",
  output: "assistant answer",
});

// Trace-level attributes
Context.setTraceAttributes({
  sessionId: "session-123",
  userId: "user-456",
  tags: ["experiment-A"],
  metadata: { version: "2.0" },
});
```

---

## Dev Mode Console Output

When `environment` is `local`, a pretty printer shows span names, kinds, durations, and pass/fail status directly in the terminal:

```
[lognerve] agent  demo_session          1.2s   ✓
[lognerve]   agent  agent_turn          980ms  ✓
[lognerve]     llm    OpenAI Chat ...   385ms  ✓
[lognerve]     tool   tool:get_weather  3ms    ✓
[lognerve]     tool   tool:calculate    1ms    ✓
```

---

## Span IDs

Get the current trace and span ID from anywhere inside an `observe()` block:

```typescript
const traceId = Context.getActiveTraceId();
const spanId  = Context.getActiveSpanId();
```
