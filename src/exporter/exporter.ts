import { ConsoleSpanExporter } from "@opentelemetry/sdk-trace-node";
import { OTLPTraceExporter as OTLPHttpExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPTraceExporter as OTLPProtoExporter } from "@opentelemetry/exporter-trace-otlp-proto";

export namespace Exporter {
  export type ExporterKind = "console" | "otlp-http" | "otlp-proto";

  export interface ExporterConfig {
    kind?: ExporterKind;
    otlpEndpoint?: string;
    otlpHeaders?: Record<string, string>;
  }

  export function build(config: ExporterConfig) {
    const endpointConfig = {
      url: config.otlpEndpoint,
      headers: config.otlpHeaders,
    };
    if (config.kind === "otlp-http") {
      return new OTLPHttpExporter(endpointConfig);
    }
    if (config.kind === "otlp-proto") {
      return new OTLPProtoExporter(endpointConfig);
    }
    return new ConsoleSpanExporter();
  }
}
