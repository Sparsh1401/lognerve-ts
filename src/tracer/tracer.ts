import { readEnv } from "../shared/config";
import { readGitContext } from "../shared/git";
import { Exporter } from "../exporter/exporter";
import { LogNerveSpanProcessor } from "./processor";
import type { PiiRedactionOption } from "../privacy/pii";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { GIT_REF, GIT_REPO } from "../util/constants";
import {
  NodeTracerProvider,
  SimpleSpanProcessor,
  BatchSpanProcessor,
} from "@opentelemetry/sdk-trace-node";
import { SEMRESATTRS_PROJECT_NAME } from "@arizeai/openinference-semantic-conventions";
import { SEMRESATTRS_DEPLOYMENT_ENVIRONMENT } from "@opentelemetry/semantic-conventions";

export namespace Tracer {
  export interface TracerConfig {
    apiKey?: string;
    domain?: string;
    enabled?: boolean;
    projectName?: string;
    serviceName?: string;
    gitRepo?: string;
    gitRef?: string;
    exporter?: Exporter.ExporterKind;
    otlpEndpoint?: string;
    otlpHeaders?: Record<string, string>;
    otlpCompression?: Exporter.OtlpCompression;
    batchExport?: boolean;
    environment?: "local" | "production";
    redactPii?: PiiRedactionOption;
  }

  export interface TraceHandle {
    provider: NodeTracerProvider;
    flush: () => Promise<void>;
    shutdown: () => Promise<void>;
  }

  export function create(config: TracerConfig = {}): TraceHandle | null {
    const merged: TracerConfig = { ...readEnv(), ...config };
    if (merged.enabled === false) return null;
    // Default to backend export (protobuf + gzip). The LogNerve backend accepts
    // OTLP/proto and OTLP/JSON, but proto is the smaller wire format and matches
    // the OpenInference default; gzip keeps every backend-bound payload compressed.
    // Devs can still opt into "otlp-http" or "console" explicitly. Local console
    // rendering is handled separately by LogNerveSpanProcessor in devMode.
    if (merged.exporter === undefined) merged.exporter = "otlp-proto";
    if (merged.otlpCompression === undefined) merged.otlpCompression = "gzip";
    if (merged.environment === undefined) merged.environment = "production";
    if (merged.otlpEndpoint === undefined) {
      merged.otlpEndpoint = `https://${merged.domain || "lognerve.ai"}/api/v1/traces`;
    }
    const git = readGitContext({ gitRepo: merged.gitRepo, gitRef: merged.gitRef });

    const resourceAttributes: Record<string, string> = {
      [SEMRESATTRS_PROJECT_NAME]: merged.projectName ?? "lognerve-default",
      "service.name": merged.serviceName ?? "lognerve-app",
    };

    resourceAttributes[SEMRESATTRS_DEPLOYMENT_ENVIRONMENT] = merged.environment;
    if (git.gitRepo !== undefined) {
      resourceAttributes[GIT_REPO] = git.gitRepo;
    }
    if (git.gitRef !== undefined) {
      resourceAttributes[GIT_REF] = git.gitRef;
    }

    const resource = resourceFromAttributes(resourceAttributes);

    const exporter = Exporter.build({
      kind: merged.exporter,
      apiKey: merged.apiKey,
      otlpEndpoint: merged.otlpEndpoint,
      otlpHeaders: merged.otlpHeaders,
      otlpCompression: merged.otlpCompression,
    });

    const exportProcessor = merged.batchExport
      ? new BatchSpanProcessor(exporter)
      : new SimpleSpanProcessor(exporter);

    const devMode = merged.environment === "local";

    const provider = new NodeTracerProvider({
      resource,
      spanProcessors: [
        new LogNerveSpanProcessor({
          devMode,
          gitRepo: git.gitRepo,
          gitRef: git.gitRef,
          redactPii: merged.redactPii,
        }),
        exportProcessor,
      ],
    });

    provider.register();

    return {
      provider,
      flush: () => provider.forceFlush(),
      shutdown: () => provider.shutdown(),
    };
  }
}
