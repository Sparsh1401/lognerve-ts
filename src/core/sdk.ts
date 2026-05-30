import { Tracer } from "../tracer/tracer";
import { Instrumentation } from "../instrumentation/instrumentation";
import { readInstrumentations } from "../shared/config";

export interface LogNerveOptions extends Tracer.TracerConfig {
  instrumentations?: Instrumentation.Kind[];
}

let _handle: ReturnType<typeof Tracer.create> | null = null;
let _unregister: Instrumentation.RegisterResult = {};

export function initialize(config: LogNerveOptions = {}): void {
  if (_handle) return;

  _handle = Tracer.create(config);

  const kinds = config.instrumentations ?? readInstrumentations();
  if (kinds.length > 0) {
    _unregister = Instrumentation.register(kinds, {
      tracerProvider: _handle.provider,
    });
  }

  // Auto-flush on graceful exit so buffered spans aren't lost
  // with BatchSpanProcessor when the app errors before explicit flush()
  const onExit = () => {
    _handle?.flush();
  };
  process.once("beforeExit", onExit);
}

export async function flush(): Promise<void> {
  await _handle?.flush();
}

export async function shutdown(): Promise<void> {
  Object.values(_unregister).forEach((fn) => fn?.());
  await _handle?.shutdown();
  _handle = null;
  _unregister = {};
}
