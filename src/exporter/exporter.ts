import { diag } from "@opentelemetry/api";
import { ExportResultCode } from "@opentelemetry/core";
import { ConsoleSpanExporter } from "@opentelemetry/sdk-trace-node";
import type {
  ReadableSpan,
  SpanExporter,
} from "@opentelemetry/sdk-trace-base";
import { OTLPTraceExporter as OTLPHttpExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPTraceExporter as OTLPProtoExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { CompressionAlgorithm } from "@opentelemetry/otlp-exporter-base";
import { SDK_NAME, SDK_VERSION } from "../util/constants";

export namespace Exporter {
  export type ExporterKind = "console" | "otlp-http" | "otlp-proto";
  export type OtlpCompression = "none" | "gzip";

  export interface ExporterConfig {
    kind?: ExporterKind;
    apiKey?: string;
    otlpEndpoint?: string;
    otlpHeaders?: Record<string, string>;
    otlpCompression?: OtlpCompression;
  }

  export function build(config: ExporterConfig): SpanExporter {
    const endpointConfig = {
      url: config.otlpEndpoint,
      headers: buildHeaders({
        apiKey: config.apiKey,
        otlpHeaders: config.otlpHeaders,
      }),
      compression: toCompressionAlgorithm(config.otlpCompression),
    };
    if (config.kind === "otlp-http") {
      return withSafeFailureHandling(new OTLPHttpExporter(endpointConfig));
    }
    if (config.kind === "otlp-proto") {
      return withSafeFailureHandling(new OTLPProtoExporter(endpointConfig));
    }
    return new ConsoleSpanExporter();
  }

  export function withSafeFailureHandling(exporter: SpanExporter): SpanExporter {
    return new SafeSpanExporter(exporter);
  }

  export function buildHeaders(config: {
    apiKey?: string;
    otlpHeaders?: Record<string, string>;
  }): Record<string, string> {
    return {
      "x-lognerve-sdk-name": SDK_NAME,
      "x-lognerve-sdk-version": SDK_VERSION,
      ...(config.apiKey !== undefined
        ? { Authorization: `Bearer ${config.apiKey}` }
        : {}),
      ...(config.otlpHeaders ?? {}),
    };
  }

  function toCompressionAlgorithm(
    compression: OtlpCompression | undefined,
  ): CompressionAlgorithm | undefined {
    if (compression === "gzip") return CompressionAlgorithm.GZIP;
    if (compression === "none") return CompressionAlgorithm.NONE;
    return undefined;
  }

  class SafeSpanExporter implements SpanExporter {
    constructor(private readonly inner: SpanExporter) {}

    export(
      spans: ReadableSpan[],
      resultCallback: (result: { code: ExportResultCode; error?: Error }) => void,
    ): void {
      try {
        this.inner.export(spans, (result) => {
          if (result.code === ExportResultCode.SUCCESS) {
            resultCallback(result);
            return;
          }

          diag.debug("[lognerve] span export failed", result.error);
          resultCallback({ code: ExportResultCode.SUCCESS });
        });
      } catch (err) {
        diag.debug("[lognerve] span export threw", err);
        resultCallback({ code: ExportResultCode.SUCCESS });
      }
    }

    async forceFlush(): Promise<void> {
      try {
        await this.inner.forceFlush?.();
      } catch (err) {
        diag.debug("[lognerve] exporter forceFlush failed", err);
      }
    }

    async shutdown(): Promise<void> {
      try {
        await this.inner.shutdown();
      } catch (err) {
        diag.debug("[lognerve] exporter shutdown failed", err);
      }
    }
  }
}
