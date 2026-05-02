import { ConsoleSpanExporter } from "@opentelemetry/sdk-trace-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";

export namespace Exporter {
  export type ExporterKind = "console" | "otlp-http";

  export interface ExporterConfig {
    kind?: ExporterKind;
    otlpEndpoint?: string;
    otlpHeaders?: Record<string, string>;
  }

  export function build(config: ExporterConfig) {
    if (config.kind === "otlp-http") {
      return new OTLPTraceExporter({
        url: config.otlpEndpoint,
        headers: config.otlpHeaders,
      });
    }
    return new ConsoleSpanExporter();
  }
}
