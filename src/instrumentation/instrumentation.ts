import { OpenAIInstrumentation } from "@arizeai/openinference-instrumentation-openai";
import { AnthropicInstrumentation } from "@arizeai/openinference-instrumentation-anthropic";
import type { TraceConfigOptions } from "@arizeai/openinference-core";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import type { TracerProvider } from "@opentelemetry/api";

export namespace Instrumentation {
  export type Kind = "openai" | "anthropic";
  export type Unregister = () => void;
  export type RegisterResult = Partial<Record<Kind, Unregister>>;

  export interface RegisterOptions {
    tracerProvider?: TracerProvider;
    traceConfig?: TraceConfigOptions;
  }

  export function register(
    kinds: Kind[],
    options: RegisterOptions = {},
  ): RegisterResult {
    const instrumentations = [];

    for (const kind of kinds) {
      instrumentations.push(build(kind, options.traceConfig));
    }

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

function build(kind: Instrumentation.Kind, traceConfig?: TraceConfigOptions) {
  if (kind === "openai") return new OpenAIInstrumentation({ traceConfig });
  if (kind === "anthropic")
    return new AnthropicInstrumentation({ traceConfig });
  throw new Error(`Unknown instrumentation kind: ${kind}`);
}
