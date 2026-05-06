import type { Span } from "@opentelemetry/api";
import type {
  ReadableSpan,
  SpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import type { Context } from "@opentelemetry/api";
import { SpanStatusCode } from "@opentelemetry/api";

const SPAN_KIND_ATTR = "openinference.span.kind";
const SPAN_PATH_ATTR = "lognerve.span.path";
const SPAN_IDS_PATH_ATTR = "lognerve.span.ids_path";

const KIND_COLOR: Record<string, string> = {
  AGENT: "\x1b[35m", // magenta
  TOOL: "\x1b[36m", // cyan
  LLM: "\x1b[34m", // blue
  CHAIN: "\x1b[33m", // yellow
};
const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";

function formatDuration(hrDuration: [number, number]): string {
  const ms = hrDuration[0] * 1000 + hrDuration[1] / 1_000_000;
  return ms < 1000 ? `${ms.toFixed(0)}ms` : `${(ms / 1000).toFixed(2)}s`;
}

function indent(depth: number): string {
  return "  ".repeat(depth);
}

export class LogNerveSpanProcessor implements SpanProcessor {
  private readonly devMode: boolean;

  // call trace maps — keyed by spanId, live only while span is in-flight
  private readonly _namePath = new Map<string, string[]>();
  private readonly _idsPath = new Map<string, string[]>();

  // depth map for dev console indentation — keyed by "traceId:spanId"
  private readonly _depthMap = new Map<string, number>();

  constructor(devMode = false) {
    this.devMode = devMode;
  }

  onStart(span: Span, _parentContext: Context): void {
    const { spanId } = span.spanContext();
    // parentSpanId is a stable internal field on the SDK Span implementation
    const parentSpanId: string | undefined = (
      span as unknown as { parentSpanId?: string }
    ).parentSpanId;

    const parentNamePath = parentSpanId
      ? this._namePath.get(parentSpanId)
      : undefined;
    const parentIdsPath = parentSpanId
      ? this._idsPath.get(parentSpanId)
      : undefined;

    const spanName = (span as unknown as { name: string }).name ?? "";

    const spanNamePath: string[] = parentNamePath
      ? [...parentNamePath, spanName]
      : [spanName];

    const spanIdsPath: string[] =
      parentNamePath && parentSpanId
        ? [...(parentIdsPath ?? []), parentSpanId]
        : [];

    span.setAttribute(SPAN_PATH_ATTR, spanNamePath);
    span.setAttribute(SPAN_IDS_PATH_ATTR, spanIdsPath);

    this._namePath.set(spanId, spanNamePath);
    this._idsPath.set(spanId, spanIdsPath);
  }

  onEnd(span: ReadableSpan): void {
    const { spanId, traceId } = span.spanContext();

    // clean up call trace maps
    this._namePath.delete(spanId);
    this._idsPath.delete(spanId);

    if (!this.devMode) return;

    // derive depth from ids_path length (each entry = one ancestor)
    const idsPath = span.attributes[SPAN_IDS_PATH_ATTR] as string[] | undefined;
    const depth = idsPath?.length ?? 0;

    const traceKey = `${traceId}:${spanId}`;
    this._depthMap.set(traceKey, depth);

    const kind =
      (span.attributes[SPAN_KIND_ATTR] as string | undefined) ?? "SPAN";
    const color = KIND_COLOR[kind] ?? DIM;
    const status =
      span.status.code === SpanStatusCode.ERROR
        ? `${RED}✗${RESET}`
        : `${GREEN}✓${RESET}`;
    const dur = formatDuration(span.duration);
    const prefix = indent(depth);

    process.stdout.write(
      `${DIM}[lognerve]${RESET} ${prefix}${color}${kind.toLowerCase()}${RESET}  ${span.name}  ${DIM}${dur}${RESET}  ${status}\n`,
    );

    this._depthMap.delete(traceKey);
  }

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }

  shutdown(): Promise<void> {
    this._namePath.clear();
    this._idsPath.clear();
    this._depthMap.clear();
    return Promise.resolve();
  }
}
