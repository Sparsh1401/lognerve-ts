import type { Span } from "@opentelemetry/api";
import type { ReadableSpan, SpanProcessor } from "@opentelemetry/sdk-trace-base";
import type { Context } from "@opentelemetry/api";
import { SpanStatusCode } from "@opentelemetry/api";

const SPAN_KIND_ATTR = "openinference.span.kind";

const KIND_COLOR: Record<string, string> = {
  AGENT: "\x1b[35m", // magenta
  TOOL:  "\x1b[36m", // cyan
  LLM:   "\x1b[34m", // blue
  CHAIN: "\x1b[33m", // yellow
};
const RESET  = "\x1b[0m";
const GREEN  = "\x1b[32m";
const RED    = "\x1b[31m";
const DIM    = "\x1b[2m";

function formatDuration(hrDuration: [number, number]): string {
  const ms = hrDuration[0] * 1000 + hrDuration[1] / 1_000_000;
  return ms < 1000 ? `${ms.toFixed(0)}ms` : `${(ms / 1000).toFixed(2)}s`;
}

function indent(depth: number): string {
  return "  ".repeat(depth);
}

// tracks parent→child depth for indentation
const depthMap = new Map<string, number>();

export class LogNerveSpanProcessor implements SpanProcessor {
  private readonly devMode: boolean;

  constructor(devMode = false) {
    this.devMode = devMode;
  }

  onStart(span: Span, _parentContext: Context): void {
    if (!this.devMode) return;

    const ctx = span.spanContext();
    const parentDepth = depthMap.get(ctx.traceId) ?? 0;
    depthMap.set(`${ctx.traceId}:${ctx.spanId}`, parentDepth);
  }

  onEnd(span: ReadableSpan): void {
    if (!this.devMode) return;

    const ctx = span.spanContext();
    const traceKey = `${ctx.traceId}:${ctx.spanId}`;

    // derive depth from parent span
    const parentSpanId = span.parentSpanContext?.spanId;
    const depth = parentSpanId
      ? (depthMap.get(`${ctx.traceId}:${parentSpanId}`) ?? 0) + 1
      : 0;

    depthMap.set(traceKey, depth);

    const kind   = (span.attributes[SPAN_KIND_ATTR] as string | undefined) ?? "SPAN";
    const color  = KIND_COLOR[kind] ?? DIM;
    const status = span.status.code === SpanStatusCode.ERROR ? `${RED}✗${RESET}` : `${GREEN}✓${RESET}`;
    const dur    = formatDuration(span.duration);
    const prefix = indent(depth);

    process.stdout.write(
      `${DIM}[lognerve]${RESET} ${prefix}${color}${kind.toLowerCase()}${RESET}  ${span.name}  ${DIM}${dur}${RESET}  ${status}\n`,
    );

    // clean up depth entry once span is done
    depthMap.delete(traceKey);
  }

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }

  shutdown(): Promise<void> {
    depthMap.clear();
    return Promise.resolve();
  }
}
