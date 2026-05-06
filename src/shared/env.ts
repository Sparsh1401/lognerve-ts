import type { Tracer } from "../tracer/tracer";
import type { Instrumentation } from "../instrumentation/instrumentation";

export function readEnv(): Partial<Tracer.TracerConfig> {
  return {
    projectName: process.env.LOGNERVE_PROJECT_NAME,
    serviceName: process.env.LOGNERVE_SERVICE_NAME,
    otlpEndpoint: process.env.LOGNERVE_OTLP_ENDPOINT,
    otlpHeaders: parseHeaders(process.env.LOGNERVE_OTLP_HEADERS),
    exporter: parseExporterKind(process.env.LOGNERVE_EXPORTER),
    environment: parseEnvironment(process.env.LOGNERVE_ENVIRONMENT),
  };
}

export function readInstrumentations(): Instrumentation.Kind[] {
  const raw = process.env.LOGNERVE_INSTRUMENTATIONS;
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(
      (s): s is Instrumentation.Kind => s === "openai" || s === "anthropic",
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
