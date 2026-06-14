import type { Tracer } from "../tracer/tracer";
import type { Instrumentation } from "../instrumentation/instrumentation";

export function readEnv(): Partial<Tracer.TracerConfig> {
  return {
    apiKey: process.env.LOGNERVE_API_KEY,
    domain: process.env.LOGNERVE_DOMAIN,
    enabled: parseBoolean(process.env.LOGNERVE_ENABLED),
    projectName: process.env.LOGNERVE_PROJECT_NAME,
    serviceName: process.env.LOGNERVE_SERVICE_NAME,
    gitRepo: process.env.LOGNERVE_GIT_REPO,
    gitRef: process.env.LOGNERVE_GIT_REF,
    otlpEndpoint: process.env.LOGNERVE_OTLP_ENDPOINT,
    otlpHeaders: parseHeaders(process.env.LOGNERVE_OTLP_HEADERS),
    otlpCompression: parseCompression(process.env.LOGNERVE_OTLP_COMPRESSION),
    batchExport: parseBoolean(process.env.LOGNERVE_BATCH_EXPORT),
    exporter: parseExporterKind(process.env.LOGNERVE_EXPORTER),
    environment: parseEnvironment(process.env.LOGNERVE_ENVIRONMENT),
    redactPii: parseBoolean(process.env.LOGNERVE_REDACT_PII),
  };
}

export function readInstrumentations(): Instrumentation.Kind[] {
  const raw = process.env.LOGNERVE_INSTRUMENTATIONS;
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(isInstrumentationKind);
}

function isInstrumentationKind(value: string): value is Instrumentation.Kind {
  return (
    value === "openai" ||
    value === "anthropic" ||
    value === "langchain" ||
    value === "bedrock" ||
    value === "claude-agent-sdk"
  );
}

function parseHeaders(
  raw: string | undefined,
): Record<string, string> | undefined {
  if (!raw) return undefined;
  // format: "key1=value1,key2=value2"
  return Object.fromEntries(
    raw.split(",").map((pair) => {
      const [key, ...rest] = pair.split("=");
      return [key.trim(), rest.join("=").trim()];
    }),
  );
}

function parseExporterKind(
  raw: string | undefined,
): "console" | "otlp-http" | "otlp-proto" | undefined {
  if (raw === "console" || raw === "otlp-http" || raw === "otlp-proto")
    return raw;
  return undefined;
}

function parseEnvironment(
  raw: string | undefined,
): "local" | "production" | undefined {
  if (raw === "production") return "production";
  if (raw === "local" || raw === "development") return "local";
  return undefined;
}

function parseCompression(
  raw: string | undefined,
): "none" | "gzip" | undefined {
  if (raw === "none" || raw === "gzip") return raw;
  return undefined;
}

function parseBoolean(raw: string | undefined): boolean | undefined {
  if (raw === "true" || raw === "1" || raw === "yes") return true;
  if (raw === "false" || raw === "0" || raw === "no") return false;
  return undefined;
}
