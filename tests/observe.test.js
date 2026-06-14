const { afterEach, beforeEach, describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { context, propagation, SpanStatusCode, trace } = require("@opentelemetry/api");
const { InMemorySpanExporter, SimpleSpanProcessor } = require("@opentelemetry/sdk-trace-base");
const { NodeTracerProvider } = require("@opentelemetry/sdk-trace-node");

const SPAN_KIND = "openinference.span.kind";
const INPUT_VALUE = "input.value";
const OUTPUT_VALUE = "output.value";

function loadSdk() {
  for (const path of [
    "../dist/index.js",
    "../dist/core/lognerve.js",
    "../dist/context/context.js",
    "../dist/privacy/pii.js",
    "../dist/tracer/processor.js",
  ]) {
    delete require.cache[require.resolve(path)];
  }
  return require("../dist/index.js");
}

describe("observe", () => {
  let exporter;
  let provider;
  let providerShutdown;

  beforeEach(() => {
    exporter = new InMemorySpanExporter();
    provider = new NodeTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    provider.register();
    providerShutdown = false;
  });

  afterEach(async () => {
    if (!providerShutdown) await provider.shutdown();
    exporter.reset();
    trace.disable();
    context.disable();
    propagation.disable();
  });

  it("captures sync function input, output, options, and source location", async () => {
    const { lognerve } = loadSdk();

    const result = await lognerve.observe(
      {
        name: "sync-add",
        type: "span",
        sessionId: "session-1",
        userId: "user-1",
        metadata: { route: "test" },
        tags: ["unit"],
      },
      (left, right) => left + right,
      2,
      3,
    );

    assert.equal(result, 5);
    const [span] = exporter.getFinishedSpans();
    assert.equal(span.name, "sync-add");
    assert.equal(span.attributes[SPAN_KIND], "CHAIN");
    assert.equal(span.attributes[INPUT_VALUE], JSON.stringify([2, 3]));
    assert.equal(span.attributes[OUTPUT_VALUE], JSON.stringify(5));
    assert.equal(span.attributes["session.id"], "session-1");
    assert.equal(span.attributes["user.id"], "user-1");
    assert.equal(span.attributes["lognerve.trace.metadata"], JSON.stringify({ route: "test" }));
    assert.equal(span.attributes["lognerve.trace.tags"], JSON.stringify(["unit"]));
    assert.equal(typeof span.attributes["lognerve.git.source_file"], "string");
    assert.equal(typeof span.attributes["lognerve.git.source_line"], "number");
  });

  it("keeps the root package API minimal", () => {
    const sdk = loadSdk();

    assert.deepEqual(Object.keys(sdk).sort(), ["lognerve"]);
    assert.deepEqual(Object.keys(sdk.lognerve).sort(), [
      "initialize",
      "observe",
      "usingAttributes",
    ]);
  });

  it("redacts common PII with local regex rules", () => {
    const { PiiRedactor } = require("../dist/privacy/pii.js");
    const redactor = new PiiRedactor({
      patterns: [{ pattern: "customer-[0-9]+", replacement: "[CUSTOMER_ID]" }],
    });

    assert.equal(
      redactor.redact(
        "email jane@example.com phone 415-555-1212 card 4111 1111 1111 1111 token Bearer abcdefghijklmnop customer-42",
      ),
      "email [REDACTED] phone [REDACTED] card [REDACTED] token [REDACTED] [CUSTOMER_ID]",
    );
  });

  it("redacts span attributes before export when enabled", () => {
    const { LogNerveSpanProcessor } = require("../dist/tracer/processor.js");
    const processor = new LogNerveSpanProcessor({ redactPii: true });
    const span = {
      name: "pii jane@example.com",
      attributes: {
        [INPUT_VALUE]: JSON.stringify("call me at 415-555-1212"),
        [OUTPUT_VALUE]: JSON.stringify({ answer: "email jane@example.com" }),
      },
      events: [{ name: "Bearer abcdefghijklmnop", attributes: { token: "lnv_abcdefghijklmnop" } }],
      spanContext: () => ({ spanId: "span", traceId: "trace" }),
    };

    processor.onEnd(span);

    assert.equal(span.name, "pii [REDACTED]");
    assert.equal(span.attributes[INPUT_VALUE], JSON.stringify("call me at [REDACTED]"));
    assert.equal(
      span.attributes[OUTPUT_VALUE],
      JSON.stringify({ answer: "email [REDACTED]" }),
    );
    assert.equal(span.events[0].name, "[REDACTED]");
    assert.equal(span.events[0].attributes.token, "[REDACTED]");
  });

  it("runs the function as a no-op when no provider is registered", async () => {
    await provider.shutdown();
    providerShutdown = true;
    exporter.reset();
    trace.disable();
    context.disable();
    propagation.disable();

    const { lognerve } = loadSdk();
    const writeStderr = process.stderr.write;
    let warning = "";
    process.stderr.write = (chunk, ...args) => {
      warning += String(chunk);
      return true;
    };

    let result;
    try {
      result = await lognerve.observe({ name: "noop" }, () => "untraced");
    } finally {
      process.stderr.write = writeStderr;
    }

    assert.equal(result, "untraced");
    assert.equal(exporter.getFinishedSpans().length, 0);
    assert.match(warning, /spans will not be recorded/);
  });

  it("does not set output.value when JSON serialization returns undefined", async () => {
    const { lognerve } = loadSdk();

    await lognerve.observe({ name: "undefined-output" }, () => undefined);

    const [span] = exporter.getFinishedSpans();
    assert.equal(span.attributes[OUTPUT_VALUE], undefined);
  });

  it("records thrown errors and rethrows", async () => {
    const { lognerve } = loadSdk();

    await assert.rejects(
      () =>
        lognerve.observe({ name: "throws" }, () => {
          throw new Error("boom");
        }),
      /boom/,
    );

    const [span] = exporter.getFinishedSpans();
    assert.equal(span.status.code, SpanStatusCode.ERROR);
    assert.equal(span.events.some((event) => event.name === "exception"), true);
  });

  it("parents nested observe calls", async () => {
    const { lognerve } = loadSdk();

    await lognerve.observe({ name: "parent" }, async () => {
      await lognerve.observe({ name: "child" }, () => "ok");
    });

    const spans = exporter.getFinishedSpans();
    const parent = spans.find((span) => span.name === "parent");
    const child = spans.find((span) => span.name === "child");
    assert.ok(parent);
    assert.ok(child);
    assert.equal(child.parentSpanContext.spanId, parent.spanContext().spanId);
  });

  it("applies ambient attributes from usingAttributes to manual observe spans", async () => {
    const { lognerve } = loadSdk();

    await lognerve.usingAttributes(
      {
        sessionId: "ambient-session",
        userId: "ambient-user",
        tags: ["ambient"],
        metadata: { source: "ambient" },
      },
      async () => {
        await lognerve.observe({ name: "ambient" }, () => "ok");
      },
    );

    const [span] = exporter.getFinishedSpans();
    assert.equal(span.attributes["session.id"], "ambient-session");
    assert.equal(span.attributes["user.id"], "ambient-user");
    assert.equal(span.attributes["tag.tags"], JSON.stringify(["ambient"]));
    assert.equal(span.attributes.metadata, JSON.stringify({ source: "ambient" }));
  });

  it("keeps async generator spans active across yields", async () => {
    const { lognerve } = loadSdk();

    async function* stream(prefix) {
      await lognerve.observe({ name: "child-in-stream" }, () => "child-result");
      yield `${prefix}-1`;
      yield `${prefix}-2`;
    }

    const chunks = [];
    for await (const chunk of lognerve.observe({ name: "stream", type: "llm" }, stream, "chunk")) {
      chunks.push(chunk);
    }

    assert.deepEqual(chunks, ["chunk-1", "chunk-2"]);

    const spans = exporter.getFinishedSpans();
    const parent = spans.find((span) => span.name === "stream");
    const child = spans.find((span) => span.name === "child-in-stream");
    assert.ok(parent);
    assert.ok(child);
    assert.equal(parent.attributes[SPAN_KIND], "LLM");
    assert.equal(parent.attributes[INPUT_VALUE], JSON.stringify("chunk"));
    assert.equal(parent.attributes[OUTPUT_VALUE], JSON.stringify(["chunk-1", "chunk-2"]));
    assert.equal(child.parentSpanContext.spanId, parent.spanContext().spanId);
  });

  it("records async generator errors", async () => {
    const { lognerve } = loadSdk();

    async function* stream() {
      yield "first";
      throw new Error("stream failed");
    }

    await assert.rejects(async () => {
      for await (const _chunk of lognerve.observe({ name: "bad-stream" }, stream)) {
      }
    }, /stream failed/);

    const [span] = exporter.getFinishedSpans();
    assert.equal(span.name, "bad-stream");
    assert.equal(span.status.code, SpanStatusCode.ERROR);
    assert.equal(span.attributes[OUTPUT_VALUE], undefined);
  });

  it("closes async generators when the consumer exits early", async () => {
    const { lognerve } = loadSdk();
    let closed = false;

    async function* stream() {
      try {
        yield "first";
        yield "second";
      } finally {
        closed = true;
      }
    }

    for await (const _chunk of lognerve.observe({ name: "early-close" }, stream)) {
      break;
    }

    const [span] = exporter.getFinishedSpans();
    assert.equal(closed, true);
    assert.equal(span.name, "early-close");
    assert.equal(span.attributes[OUTPUT_VALUE], JSON.stringify(["first"]));
  });
});
