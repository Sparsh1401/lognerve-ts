import { readEnv } from "../shared/env";
import { Exporter } from "../exporter/exporter";
import { LogNerveSpanProcessor } from "./processor";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  NodeTracerProvider,
  SimpleSpanProcessor,
  BatchSpanProcessor,
} from "@opentelemetry/sdk-trace-node";
import { SEMRESATTRS_PROJECT_NAME } from "@arizeai/openinference-semantic-conventions";

export namespace Tracer {
  export interface TracerConfig {
    projectName?: string;
    serviceName?: string;
    exporter?: Exporter.ExporterKind;
    otlpEndpoint?: string;
    otlpHeaders?: Record<string, string>;
    batchExport?: boolean;
    environment?: "local" | "production";
  }

  interface TraceHandle {
    provider: NodeTracerProvider;
    flush: () => Promise<void>;
    shutdown: () => Promise<void>;
  }

  export function create(config: TracerConfig = {}): TraceHandle {
    const merged: TracerConfig = { ...readEnv(), ...config };

    const resource = resourceFromAttributes({
      [SEMRESATTRS_PROJECT_NAME]: merged.projectName ?? "lognerve-default",
      "service.name": merged.serviceName ?? "lognerve-app",
    });

    const exporter = Exporter.build({
      kind: merged.exporter,
      otlpEndpoint: merged.otlpEndpoint,
      otlpHeaders: merged.otlpHeaders,
    });

    const exportProcessor = merged.batchExport
      ? new BatchSpanProcessor(exporter)
      : new SimpleSpanProcessor(exporter);

    const devMode = merged.environment === "local";

    const provider = new NodeTracerProvider({
      resource,
      spanProcessors: [new LogNerveSpanProcessor(devMode), exportProcessor],
    });

    provider.register();

    return {
      provider,
      flush: () => provider.forceFlush(),
      shutdown: () => provider.shutdown(),
    };
  }
}
