import { diag } from "@opentelemetry/api";
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
    assertSafeEndpoint(merged.otlpEndpoint);
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

  // Validate the resolved export endpoint before any telemetry (which can carry
  // LLM prompts/completions and the API key) leaves the process.
  function assertSafeEndpoint(endpoint: string): void {
    let url: URL;
    try {
      url = new URL(endpoint);
    } catch {
      diag.warn(`[lognerve] invalid otlpEndpoint "${endpoint}"; export may fail`);
      return;
    }

    if (url.protocol !== "https:") {
      // http:// sends the Authorization: Bearer <apiKey> header in cleartext.
      diag.warn(
        `[lognerve] insecure otlpEndpoint "${endpoint}" — use https:// so the API key and trace data are not sent in plaintext`,
      );
    }

    if (isPrivateOrMetadataHost(url.hostname)) {
      // SSRF guard: a poisoned LOGNERVE_DOMAIN/LOGNERVE_OTLP_ENDPOINT could
      // redirect telemetry to the cloud metadata service or an internal host.
      diag.warn(
        `[lognerve] otlpEndpoint host "${url.hostname}" resolves to a private/link-local address; refusing to use it as a default target`,
      );
    }
  }

  function isPrivateOrMetadataHost(hostname: string): boolean {
    const host = hostname.replace(/^\[|\]$/g, "");
    if (host === "localhost" || host === "::1") return true;

    const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (!ipv4) return false;
    const [a, b] = ipv4.slice(1).map(Number);
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // loopback
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 169 && b === 254) return true; // link-local / cloud metadata
    if (a === 0) return true;
    return false;
  }
}
