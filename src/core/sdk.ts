import { Tracer } from "../tracer/tracer";
import { Instrumentation } from "../instrumentation/instrumentation";
import { readInstrumentations } from "../shared/config";

export interface LogNerveOptions extends Tracer.TracerConfig {
  instrumentations?: Instrumentation.Kind[];
}

let _handle: Tracer.TraceHandle | null = null;
let _unregister: Instrumentation.RegisterResult = {};

export function initialize(config: LogNerveOptions = {}): void {
  if (_handle !== null) return;

  try {
    _handle = Tracer.create(config);
    if (!_handle) return;

    const kinds = config.instrumentations ?? readInstrumentations();
    if (kinds.length > 0) {
      _unregister = Instrumentation.register(kinds, {
        tracerProvider: _handle.provider,
      });
    }

    const onExit = () => {
      try {
        _handle?.flush();
      } catch {
        // never crash the process on flush failure
      }
    };
    process.once("beforeExit", onExit);
  } catch (err) {
    // Log only the message — the raw error/stack can carry configuration
    // details (endpoint, header names) that we do not want on stdout.
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[lognerve] initialize() failed — tracing disabled: ${message}`);
    _handle = null;
  }
}

export async function flush(): Promise<void> {
  try {
    await _handle?.flush();
  } catch {
    // never crash the app on flush failure
  }
}

export async function shutdown(): Promise<void> {
  try {
    Object.values(_unregister).forEach((fn) => fn?.());
    await _handle?.shutdown();
  } catch {
    // never crash the app on shutdown failure
  }
  _handle = null;
  _unregister = {};
}
