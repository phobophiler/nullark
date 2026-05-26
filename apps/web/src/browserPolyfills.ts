import { Buffer } from "buffer";
import processShim from "process";

declare global {
  var Buffer: typeof import("buffer").Buffer | undefined;
  var process: typeof processShim | undefined;
}

if (!globalThis.Buffer) {
  globalThis.Buffer = Buffer;
}

if (!globalThis.process) {
  globalThis.process = processShim;
}
