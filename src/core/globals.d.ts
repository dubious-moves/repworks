// The few globals core may use: pure, and present in browsers, workers and Node alike.
declare class TextEncoder {
  encode(input?: string): Uint8Array;
}
