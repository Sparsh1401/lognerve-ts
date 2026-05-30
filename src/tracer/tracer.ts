import { readEnv } from "../shared/config";
import { readGitContext } from "../shared/git";
import { Exporter } from "../exporter/exporter";
import { LogNerveSpanProcessor } from "./processor";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { GIT_REF, GIT_REPO, PROJECT_ID } from "../util/constants";
import {
  NodeTracerProvider,
  SimpleSpanProcessor,
  BatchSpanProcessor,
} from "@opentelemetry/sdk-trace-node";
import { SEMRESATTRS_PROJECT_NAME } from "@arizeai/openinference-semantic-conventions";
import { SEMRESATTRS_DEPLOYMENT_ENVIRONMENT } from "@opentelemetry/semantic-conventions";

export namespace Tracer {
  export interface TracerConfig {
    projectId?: string;
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
  }

  interface TraceHandle {
    provider: NodeTracerProvider;
    flush: () => Promise<void>;
    shutdown: () => Promise<void>;
  }

  export function create(config: TracerConfig = {}): TraceHandle {
    const merged: TracerConfig = { ...readEnv(), ...config };
    const git = readGitContext({ gitRepo: merged.gitRepo, gitRef: merged.gitRef });

    const resourceAttributes: Record<string, string> = {
      [SEMRESATTRS_PROJECT_NAME]: merged.projectName ?? "lognerve-default",
      "service.name": merged.serviceName ?? "lognerve-app",
    };

    if (merged.projectId !== undefined) {
      resourceAttributes[PROJECT_ID] = merged.projectId;
    }
    if (merged.environment !== undefined) {
      resourceAttributes[SEMRESATTRS_DEPLOYMENT_ENVIRONMENT] = merged.environment;
    }
    if (git.gitRepo !== undefined) {
      resourceAttributes[GIT_REPO] = git.gitRepo;
    }
    if (git.gitRef !== undefined) {
      resourceAttributes[GIT_REF] = git.gitRef;
    }

    const resource = resourceFromAttributes(resourceAttributes);

    const exporter = Exporter.build({
      kind: merged.exporter,
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
          projectId: merged.projectId,
          gitRepo: git.gitRepo,
          gitRef: git.gitRef,
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
