import { ConsoleSpanExporter } from "@opentelemetry/sdk-trace-node";
import { OTLPTraceExporter as OTLPHttpExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPTraceExporter as OTLPProtoExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { CompressionAlgorithm } from "@opentelemetry/otlp-exporter-base";

export namespace Exporter {
  export type ExporterKind = "console" | "otlp-http" | "otlp-proto";
  export type OtlpCompression = "none" | "gzip";

  export interface ExporterConfig {
    kind?: ExporterKind;
    otlpEndpoint?: string;
    otlpHeaders?: Record<string, string>;
    otlpCompression?: OtlpCompression;
  }

  export function build(config: ExporterConfig) {
    const endpointConfig = {
      url: config.otlpEndpoint,
      headers: config.otlpHeaders,
      compression: toCompressionAlgorithm(config.otlpCompression),
    };
    if (config.kind === "otlp-http") {
      return new OTLPHttpExporter(endpointConfig);
    }
    if (config.kind === "otlp-proto") {
      return new OTLPProtoExporter(endpointConfig);
    }
    return new ConsoleSpanExporter();
  }

  function toCompressionAlgorithm(
    compression: OtlpCompression | undefined,
  ): CompressionAlgorithm | undefined {
    if (compression === "gzip") return CompressionAlgorithm.GZIP;
    if (compression === "none") return CompressionAlgorithm.NONE;
    return undefined;
  }
}
