import { context, trace, SpanStatusCode } from "@opentelemetry/api";
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
  TRACE_METADATA,
  TRACE_TAGS,
} from "../util/constants";

const SPAN_KIND_ATTR = "openinference.span.kind";

const KIND_MAP: Record<ObserveOptions["type"] & string, string> = {
  agent: "AGENT",
  tool: "TOOL",
  llm: "LLM",
  chain: "CHAIN",
};

let _tracer: ReturnType<typeof trace.getTracer> | undefined;

function getTracer() {
  _tracer ??= trace.getTracer("lognerve");
  return _tracer;
}

export interface ObserveOptions {
  name?: string;
  type?: "agent" | "tool" | "llm" | "chain";
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
    fn: (...args: A) => Promise<T>,
    ...args: A
  ): Promise<T> {
    const name = options.name ?? fn.name ?? "anonymous";

    return getTracer().startActiveSpan(name, async (span) => {
      span.setAttribute(SPAN_KIND_ATTR, KIND_MAP[options.type ?? "chain"] ?? "CHAIN");

      if (options.sessionId !== undefined) span.setAttribute(SESSION_ID, options.sessionId);
      if (options.userId !== undefined)    span.setAttribute(USER_ID, options.userId);

      if (options.captureInput !== false && args.length > 0) {
        try {
          const input = args.length === 1 ? args[0] : args;
          span.setAttribute(INPUT_VALUE, JSON.stringify(input));
        } catch {}
      }

      if (options.metadata !== undefined) {
        try { span.setAttribute(TRACE_METADATA, JSON.stringify(options.metadata)); } catch {}
      }

      if (options.tags !== undefined) {
        try { span.setAttribute(TRACE_TAGS, JSON.stringify(options.tags)); } catch {}
      }

      try {
        const result = await fn(...args);

        if (options.captureOutput !== false) {
          try { span.setAttribute(OUTPUT_VALUE, JSON.stringify(result)); } catch {}
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

  /**
   * Propagates sessionId, userId, tags and metadata to ALL spans created inside fn,
   * including auto-instrumented OpenAI/Anthropic calls.
   */
  export async function usingAttributes<T>(
    attrs: { sessionId?: string; userId?: string; tags?: string[]; metadata?: Record<string, unknown> },
    fn: () => Promise<T>,
  ): Promise<T> {
    const { setSession, setUser, setTags, setMetadata } = await import("@arizeai/openinference-core");
    let ctx = context.active();

    if (attrs.sessionId !== undefined) ctx = setSession(ctx, { sessionId: attrs.sessionId });
    if (attrs.userId !== undefined)    ctx = setUser(ctx, { userId: attrs.userId });
    if (attrs.tags !== undefined)      ctx = setTags(ctx, attrs.tags);
    if (attrs.metadata !== undefined)  ctx = setMetadata(ctx, attrs.metadata);

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
      try { span.setAttribute(INPUT_VALUE, JSON.stringify(attributes.input)); } catch {}
    }
    if (attributes.output !== undefined) {
      try { span.setAttribute(OUTPUT_VALUE, JSON.stringify(attributes.output)); } catch {}
    }
    if (attributes.model !== undefined) {
      span.setAttribute(LLM_MODEL, attributes.model);
    }
    if (attributes.modelParams !== undefined) {
      try { span.setAttribute(LLM_MODEL_PARAMETERS, JSON.stringify(attributes.modelParams)); } catch {}
    }
    if (attributes.usage !== undefined) {
      try { span.setAttribute(LLM_TOKEN_COUNT, JSON.stringify(attributes.usage)); } catch {}
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

    if (attributes.sessionId !== undefined) span.setAttribute(SESSION_ID, attributes.sessionId);
    if (attributes.userId !== undefined)    span.setAttribute(USER_ID, attributes.userId);

    if (attributes.tags !== undefined) {
      try { span.setAttribute(TRACE_TAGS, JSON.stringify(attributes.tags)); } catch {}
    }
    if (attributes.metadata !== undefined) {
      try { span.setAttribute(TRACE_METADATA, JSON.stringify(attributes.metadata)); } catch {}
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
