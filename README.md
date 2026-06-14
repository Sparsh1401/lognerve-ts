# LogNerve TypeScript SDK

Trace your LLM applications with minimal setup. Captures spans for every LLM call, tool execution, and agent step — automatically or manually — and exports them to any OpenTelemetry-compatible backend.

---

## Installation

```bash
npm install lognerve
```

---

## Quick Start

```typescript
import { lognerve } from "lognerve";

lognerve.initialize();

// wrap any async function in a span
const result = await lognerve.observe(
  { name: "my_task", type: "agent" },
  async () => {
    return "done";
  },
);
```

---

## Configuration

Pass options directly or set environment variables — env vars are the default, direct options override them.

```typescript
lognerve.initialize({
  apiKey: "lnv_sk_example",
  projectId: "proj_123",
  projectName: "my-project",
  serviceName: "my-service",
  gitRepo: "git@github.com:org/repo.git",
  gitRef: "8b7f2c1",
  environment: "production", // "local" | "production"
  exporter: "otlp-http", // "console" | "otlp-http" | "otlp-proto"
  otlpEndpoint: "https://...",
  otlpCompression: "gzip", // optional: "none" | "gzip"
  otlpHeaders: { Authorization: "Bearer ..." },
  batchExport: true, // use BatchSpanProcessor (recommended for production)
  instrumentations: ["openai", "anthropic"], // auto-instrument libraries
});
```

### Environment Variables

| Variable                    | Description                            |
| --------------------------- | -------------------------------------- |
| `LOGNERVE_API_KEY`          | API key sent as `Authorization` bearer |
| `LOGNERVE_PROJECT_ID`       | Backend project ID attached to spans   |
| `LOGNERVE_PROJECT_NAME`     | Project name attached to all spans     |
| `LOGNERVE_SERVICE_NAME`     | Service name for the resource          |
| `LOGNERVE_GIT_REPO`         | Override detected git remote URL       |
| `LOGNERVE_GIT_REF`          | Override detected git commit SHA       |
| `LOGNERVE_ENVIRONMENT`      | `local` or `production`                |
| `LOGNERVE_EXPORTER`         | `console`, `otlp-http`, `otlp-proto`   |
| `LOGNERVE_OTLP_ENDPOINT`    | OTLP collector URL                     |
| `LOGNERVE_OTLP_COMPRESSION` | `none` or `gzip` for OTLP exports      |
| `LOGNERVE_BATCH_EXPORT`     | `true` or `false` for batch export     |
| `LOGNERVE_OTLP_HEADERS`     | Headers as `key1=value1,key2=value2`   |
| `LOGNERVE_INSTRUMENTATIONS` | Comma-separated instrumentation names  |

If `gitRepo` and `gitRef` are not passed, LogNerve attempts to detect them from the current git checkout automatically.

When `otlpCompression` is set to `gzip`, the SDK sends compressed OTLP requests with `Content-Encoding: gzip`.

---

## Auto-Instrumentation

Pass the library name to `instrumentations` and all calls are traced automatically — no code changes needed.

```typescript
lognerve.initialize({ instrumentations: ["openai"] });

// IMPORTANT: require the library AFTER initialize()
const { default: OpenAI } = require("openai");
const openai = new OpenAI();

// this call is now traced automatically
const response = await openai.chat.completions.create({ ... });
```

Supported: `openai`, `anthropic`, `langchain`, `bedrock`, `claude-agent-sdk`

---

## Manual Tracing with `lognerve.observe()`

Wrap any sync or async function to create a span. Arguments are captured as input, return value as output.

```typescript
const answer = await lognerve.observe(
  { name: "agent_turn", type: "agent" },
  async (question: string) => {
    return askLLM(question);
  },
  "What is the weather in Tokyo?",
);
```

Nested `observe()` calls automatically become child spans — no parent wiring needed.

```typescript
await lognerve.observe({ name: "pipeline", type: "agent" }, async () => {
  await lognerve.observe({ name: "fetch_data", type: "tool" }, async () => { ... });
  await lognerve.observe({ name: "summarize",  type: "llm"  }, async () => { ... });
});
```

Async generator functions are supported for streaming responses. The span stays open until iteration finishes, yielded chunks are passed through unchanged, and collected chunks are recorded as output.

```typescript
async function* streamAnswer(question: string) {
  yield "Hello";
  yield " world";
}

for await (const chunk of lognerve.observe(
  { name: "stream_answer", type: "llm" },
  streamAnswer,
  "Say hi",
)) {
  process.stdout.write(chunk);
}
```

### Options

| Option          | Type                                    | Description                            |
| --------------- | --------------------------------------- | -------------------------------------- |
| `name`          | `string`                                | Span name                              |
| `type`          | `"agent" \| "tool" \| "llm" \| "chain" \| "span"` | Span kind                              |
| `captureInput`  | `boolean`                               | Capture function args (default `true`) |
| `captureOutput` | `boolean`                               | Capture return value (default `true`)  |
| `sessionId`     | `string`                                | Session ID on this span                |
| `userId`        | `string`                                | User ID on this span                   |
| `metadata`      | `object`                                | Arbitrary metadata                     |
| `tags`          | `string[]`                              | Tags                                   |

---

## Session and User Context

Use `lognerve.usingAttributes()` to attach session and user info to all spans inside a block, including auto-instrumented LLM calls.

```typescript
await lognerve.usingAttributes(
  { sessionId: "session-123", userId: "user-456", tags: ["prod"] },
  async () => {
    // every span created here carries sessionId and userId
    await runAgent();
  },
);
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

## Public API

The root package intentionally exposes only `lognerve` with `initialize`, `observe`, and `usingAttributes`.
