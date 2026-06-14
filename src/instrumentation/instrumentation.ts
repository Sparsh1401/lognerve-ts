import type { TracerProvider } from "@opentelemetry/api";

declare const require: (id: string) => any;

export namespace Instrumentation {
  export type Kind =
    | "openai"
    | "anthropic"
    | "langchain"
    | "bedrock"
    | "claude-agent-sdk";
  export type Unregister = () => void;
  export type RegisterResult = Partial<Record<Kind, Unregister>>;

  export interface RegisterOptions {
    tracerProvider?: TracerProvider;
    traceConfig?: unknown;
  }

  export function register(
    kinds: Kind[],
    options: RegisterOptions = {},
  ): RegisterResult {
    const instrumentations = [];

    for (const kind of kinds) {
      instrumentations.push(build(kind, options.traceConfig));
    }

    const { registerInstrumentations } = require("@opentelemetry/instrumentation");

    const cleanup = registerInstrumentations({
      instrumentations,
      tracerProvider: options.tracerProvider,
    });

    const unregister: Unregister = cleanup ?? (() => {});

    const result: RegisterResult = {};
    for (const kind of kinds) {
      result[kind] = unregister;
    }

    return result;
  }
}

function build(kind: Instrumentation.Kind, traceConfig?: unknown) {
  if (kind === "openai") {
    const { OpenAIInstrumentation } = require("@arizeai/openinference-instrumentation-openai");
    return new OpenAIInstrumentation({ traceConfig });
  }
  if (kind === "anthropic") {
    const { AnthropicInstrumentation } = require("@arizeai/openinference-instrumentation-anthropic");
    return new AnthropicInstrumentation({ traceConfig });
  }
  if (kind === "langchain") {
    const { LangChainInstrumentation } = require("@arizeai/openinference-instrumentation-langchain");
    return new LangChainInstrumentation({ traceConfig });
  }
  if (kind === "bedrock") {
    const { BedrockInstrumentation } = require("@arizeai/openinference-instrumentation-bedrock");
    return new BedrockInstrumentation({ traceConfig });
  }
  if (kind === "claude-agent-sdk") {
    const { ClaudeAgentSDKInstrumentation } = require("@arizeai/openinference-instrumentation-claude-agent-sdk");
    return new ClaudeAgentSDKInstrumentation({ traceConfig });
  }
  throw new Error(`Unknown instrumentation kind: ${kind}`);
}
