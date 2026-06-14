import { context, trace, SpanStatusCode, type Span } from "@opentelemetry/api";
import { getAttributesFromContext } from "@arizeai/openinference-core";
import {
  INPUT_VALUE,
  OUTPUT_VALUE,
  USER_ID,
  SESSION_ID,
} from "@arizeai/openinference-semantic-conventions";
import {
  LLM_MODEL,
  LLM_MODEL_PARAMETERS,
  LLM_TOKEN_COUNT,
  SPAN_SOURCE_FILE,
  SPAN_SOURCE_FUNCTION,
  SPAN_SOURCE_LINE,
  TRACE_METADATA,
  TRACE_TAGS,
} from "../util/constants";

const SPAN_KIND_ATTR = "openinference.span.kind";

const KIND_MAP: Record<NonNullable<ObserveOptions["type"]>, string> = {
  agent: "AGENT",
  tool: "TOOL",
  llm: "LLM",
  chain: "CHAIN",
  span: "CHAIN",
};

let _tracer: ReturnType<typeof trace.getTracer> | undefined;
let _hasWarnedUninitialized = false;

const AsyncGeneratorFunction = Object.getPrototypeOf(async function* () {})
  .constructor as FunctionConstructor;

function getTracer() {
  _tracer ??= trace.getTracer("lognerve");
  return _tracer;
}

export interface ObserveOptions {
  name?: string;
  type?: "agent" | "tool" | "llm" | "chain" | "span";
  sessionId?: string;
  userId?: string;
  captureInput?: boolean;
  captureOutput?: boolean;
  metadata?: Record<string, unknown>;
  tags?: string[];
}

export namespace Context {
  export type SpanKind = "LLM" | "TOOL" | "AGENT" | "CHAIN";

  /**
   * Wraps fn in a span. Auto-captures args as input and return value as output.
   * Nested calls automatically become child spans.
   */
  export function observe<A extends unknown[], T>(
    options: ObserveOptions,
    fn: (...args: A) => AsyncGenerator<T>,
    ...args: A
  ): AsyncGenerator<T>;
  export function observe<A extends unknown[], T>(
    options: ObserveOptions,
    fn: (...args: A) => T | Promise<T>,
    ...args: A
  ): Promise<T>;
  export function observe<A extends unknown[], T>(
    options: ObserveOptions,
    fn: (...args: A) => T | Promise<T> | AsyncGenerator<T>,
    ...args: A
  ): Promise<T> | AsyncGenerator<T> {
    const name = options.name ?? fn.name ?? "anonymous";

    if (isAsyncGeneratorFunction(fn)) {
      return observeAsyncGenerator(
        name,
        options,
        fn as (...args: A) => AsyncGenerator<T>,
        args,
      );
    }

    return observeRegular(name, options, fn as (...args: A) => T | Promise<T>, args);
  }

  /**
   * Propagates sessionId, userId, tags and metadata to ALL spans created inside fn,
   * including auto-instrumented OpenAI/Anthropic calls.
   */
  export async function usingAttributes<T>(
    attrs: {
      sessionId?: string;
      userId?: string;
      tags?: string[];
      metadata?: Record<string, unknown>;
    },
    fn: () => Promise<T>,
  ): Promise<T> {
    const { setSession, setUser, setTags, setMetadata } =
      await import("@arizeai/openinference-core");
    let ctx = context.active();

    if (attrs.sessionId !== undefined)
      ctx = setSession(ctx, { sessionId: attrs.sessionId });
    if (attrs.userId !== undefined)
      ctx = setUser(ctx, { userId: attrs.userId });
    if (attrs.tags !== undefined) ctx = setTags(ctx, attrs.tags);
    if (attrs.metadata !== undefined) ctx = setMetadata(ctx, attrs.metadata);

    return context.with(ctx, fn);
  }

  export function setAttributes(attributes: {
    name?: string;
    input?: unknown;
    output?: unknown;
    model?: string;
    modelParams?: Record<string, unknown>;
    usage?: Record<string, number>;
  }): void {
    const span = trace.getActiveSpan();
    if (!span) return;

    if (attributes.name !== undefined) span.updateName(attributes.name);

    if (attributes.input !== undefined) {
      const input = trySerialize(attributes.input);
      if (input !== undefined) span.setAttribute(INPUT_VALUE, input);
    }
    if (attributes.output !== undefined) {
      const output = trySerialize(attributes.output);
      if (output !== undefined) span.setAttribute(OUTPUT_VALUE, output);
    }
    if (attributes.model !== undefined) {
      span.setAttribute(LLM_MODEL, attributes.model);
    }
    if (attributes.modelParams !== undefined) {
      const modelParams = trySerialize(attributes.modelParams);
      if (modelParams !== undefined)
        span.setAttribute(LLM_MODEL_PARAMETERS, modelParams);
    }
    if (attributes.usage !== undefined) {
      const usage = trySerialize(attributes.usage);
      if (usage !== undefined) span.setAttribute(LLM_TOKEN_COUNT, usage);
    }
  }

  export function setTraceAttributes(attributes: {
    sessionId?: string;
    userId?: string;
    tags?: string[];
    metadata?: Record<string, unknown>;
  }): void {
    const span = trace.getActiveSpan();
    if (!span) return;

    if (attributes.sessionId !== undefined)
      span.setAttribute(SESSION_ID, attributes.sessionId);
    if (attributes.userId !== undefined)
      span.setAttribute(USER_ID, attributes.userId);

    if (attributes.tags !== undefined) {
      const tags = trySerialize(attributes.tags);
      if (tags !== undefined) span.setAttribute(TRACE_TAGS, tags);
    }
    if (attributes.metadata !== undefined) {
      const metadata = trySerialize(attributes.metadata);
      if (metadata !== undefined) span.setAttribute(TRACE_METADATA, metadata);
    }
  }

  export function getActiveSpanContext() {
    return trace.getActiveSpan()?.spanContext();
  }

  export function getActiveSpanId() {
    return getActiveSpanContext()?.spanId;
  }

  export function getActiveTraceId() {
    return getActiveSpanContext()?.traceId;
  }
}

function isAsyncGeneratorFunction(fn: unknown): boolean {
  return typeof fn === "function" && fn instanceof AsyncGeneratorFunction;
}

function trySerialize(value: unknown): string | undefined {
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

async function observeRegular<A extends unknown[], T>(
  name: string,
  options: ObserveOptions,
  fn: (...args: A) => T | Promise<T>,
  args: A,
): Promise<T> {
  return getTracer().startActiveSpan(name, async (span) => {
    if (!span.isRecording()) {
      warnUninitializedOnce();
      try {
        return await fn(...args);
      } finally {
        span.end();
      }
    }

    try {
      applyCommonAttributes(span, options, args);

      const result = await fn(...args);

      if (options.captureOutput !== false) {
        const output = trySerialize(result);
        if (output !== undefined) span.setAttribute(OUTPUT_VALUE, output);
      }

      return result;
    } catch (err) {
      span.recordException(err instanceof Error ? err : new Error(String(err)));
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw err;
    } finally {
      span.end();
    }
  });
}

async function* observeAsyncGenerator<A extends unknown[], T>(
  name: string,
  options: ObserveOptions,
  fn: (...args: A) => AsyncGenerator<T>,
  args: A,
): AsyncGenerator<T> {
  const span = getTracer().startSpan(name);

  if (!span.isRecording()) {
    warnUninitializedOnce();
    try {
      yield* fn(...args);
    } finally {
      span.end();
    }
    return;
  }

  applyCommonAttributes(span, options, args);

  const spanContext = trace.setSpan(context.active(), span);
  const generator = fn(...args);
  const collected: T[] = [];
  let failed = false;
  let completed = false;

  try {
    while (true) {
      const { value, done } = await context.with(spanContext, () =>
        generator.next(),
      );
      if (done) {
        completed = true;
        break;
      }
      collected.push(value as T);
      yield value as T;
    }
  } catch (err) {
    failed = true;
    span.recordException(err instanceof Error ? err : new Error(String(err)));
    span.setStatus({ code: SpanStatusCode.ERROR });
    throw err;
  } finally {
    if (!completed && typeof generator.return === "function") {
      try {
        await context.with(spanContext, () => generator.return(undefined));
      } catch {}
    }

    if (!failed && options.captureOutput !== false && collected.length > 0) {
      const output = trySerialize(collected);
      if (output !== undefined) span.setAttribute(OUTPUT_VALUE, output);
    }

    span.end();
  }
}

function applyCommonAttributes(
  span: Span,
  options: ObserveOptions,
  args: unknown[],
): void {
  try {
    span.setAttribute(SPAN_KIND_ATTR, KIND_MAP[options.type ?? "chain"] ?? "CHAIN");

    const contextAttributes = getAttributesFromContext(context.active());
    if (Object.keys(contextAttributes).length > 0) {
      span.setAttributes(contextAttributes);
    }

    if (options.sessionId !== undefined)
      span.setAttribute(SESSION_ID, options.sessionId);
    if (options.userId !== undefined) span.setAttribute(USER_ID, options.userId);

    if (options.captureInput !== false && args.length > 0) {
      const input = args.length === 1 ? args[0] : args;
      const serialized = trySerialize(input);
      if (serialized !== undefined) span.setAttribute(INPUT_VALUE, serialized);
    }

    if (options.metadata !== undefined) {
      const metadata = trySerialize(options.metadata);
      if (metadata !== undefined) span.setAttribute(TRACE_METADATA, metadata);
    }

    if (options.tags !== undefined) {
      const tags = trySerialize(options.tags);
      if (tags !== undefined) span.setAttribute(TRACE_TAGS, tags);
    }

    const sourceLocation = captureSourceLocation();
    if (sourceLocation.file !== undefined)
      span.setAttribute(SPAN_SOURCE_FILE, sourceLocation.file);
    if (sourceLocation.line !== undefined)
      span.setAttribute(SPAN_SOURCE_LINE, sourceLocation.line);
    if (sourceLocation.functionName !== undefined)
      span.setAttribute(SPAN_SOURCE_FUNCTION, sourceLocation.functionName);
  } catch {
    // never crash the application on span attribute failure
  }
}

function warnUninitializedOnce(): void {
  if (_hasWarnedUninitialized) return;
  _hasWarnedUninitialized = true;
  process.stderr.write(
    "[lognerve] lognerve.observe() called before lognerve.initialize(); spans will not be recorded.\n",
  );
}

function captureSourceLocation(): {
  file?: string;
  line?: number;
  functionName?: string;
} {
  const stack = new Error().stack?.split("\n").slice(1) ?? [];

  for (const frame of stack) {
    if (isInternalObserveFrame(frame)) continue;

    const match = frame.match(/^\s*at\s+(?:(.*?)\s+\()?(.+):(\d+):(\d+)\)?$/);
    if (!match) continue;

    const functionName = match[1]?.replace(/^async\s+/, "");
    const file = match[2]?.replace(/^file:\/\//, "");
    const line = Number(match[3]);

    return {
      file,
      line: Number.isFinite(line) ? line : undefined,
      functionName: functionName || undefined,
    };
  }

  return {};
}

function isInternalObserveFrame(frame: string): boolean {
  return (
    frame.includes("/src/context/context.") ||
    frame.includes("\\src\\context\\context.") ||
    frame.includes("/dist/context/context.") ||
    frame.includes("\\dist\\context\\context.") ||
    frame.includes("node:internal") ||
    frame.includes("node_modules/@opentelemetry")
  );
}
