import { type LogNerveOptions } from "./sdk";
import * as Sdk from "./sdk";

export namespace LogNerve {
  export type Config = LogNerveOptions;

  export function initialize(config: Config = {}): void {
    Sdk.initialize(config);
  }

  export async function flush(): Promise<void> {
    await Sdk.flush();
  }

  export async function shutdown(): Promise<void> {
    await Sdk.shutdown();
  }
}
