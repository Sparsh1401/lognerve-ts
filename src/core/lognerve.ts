import * as Sdk from "./sdk";
import { Context } from "../context/context";

type InstrumentationKind =
  | "openai"
  | "anthropic"
  | "langchain"
  | "bedrock"
  | "claude-agent-sdk";

interface Config {
  apiKey?: string;
  domain?: string;
  projectName?: string;
  serviceName?: string;
  gitRepo?: string;
  gitRef?: string;
  exporter?: "console" | "otlp-http" | "otlp-proto";
  otlpEndpoint?: string;
  otlpHeaders?: Record<string, string>;
  otlpCompression?: "none" | "gzip";
  batchExport?: boolean;
  environment?: "local" | "production";
  instrumentations?: InstrumentationKind[];
  redactPii?: boolean | PiiRedactionConfig;
}

interface PiiRedactionConfig {
  enabled?: boolean;
  entities?: Array<
    "email" | "phone" | "creditCard" | "ssn" | "ipAddress" | "apiKey"
  >;
  replacement?: string;
  patterns?: Array<{
    name?: string;
    pattern: string | RegExp;
    replacement?: string;
  }>;
}

interface ObserveOptions {
  name?: string;
  type?: "agent" | "tool" | "llm" | "chain" | "span";
  sessionId?: string;
  userId?: string;
  captureInput?: boolean;
  captureOutput?: boolean;
  metadata?: Record<string, unknown>;
  tags?: string[];
}

interface AttributeOptions {
  sessionId?: string;
  userId?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

function initialize(config: Config = {}): void {
  Sdk.initialize(config);
}

function observe<A extends unknown[], T>(
  options: ObserveOptions,
  fn: (...args: A) => AsyncGenerator<T>,
  ...args: A
): AsyncGenerator<T>;
function observe<A extends unknown[], T>(
  options: ObserveOptions,
  fn: (...args: A) => T | Promise<T>,
  ...args: A
): Promise<T>;
function observe<A extends unknown[], T>(
  options: ObserveOptions,
  fn: (...args: A) => T | Promise<T> | AsyncGenerator<T>,
  ...args: A
): Promise<T> | AsyncGenerator<T> {
  return Context.observe(options, fn as (...args: A) => T | Promise<T>, ...args) as
    | Promise<T>
    | AsyncGenerator<T>;
}

async function usingAttributes<T>(
  attrs: AttributeOptions,
  fn: () => Promise<T>,
): Promise<T> {
  return Context.usingAttributes(attrs, fn);
}

export const lognerve = {
  initialize,
  observe,
  usingAttributes,
  flush: Sdk.flush,
  shutdown: Sdk.shutdown,
};
