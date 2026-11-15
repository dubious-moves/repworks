/** The commit the site was built from (vite.config.ts). */
declare const __BUILD_ID__: string;

/** The engines and the model, emitted by the build under content-hashed names (vite.config.ts). */
declare module 'virtual:repworks-engines' {
  export interface EngineFile {
    url: string;
    bytes: number;
  }
  export const ENGINES: {
    stockfishJs: EngineFile;
    stockfishWasm: EngineFile;
    stockfishMtJs: EngineFile;
    stockfishMtWasm: EngineFile;
    stockfish19Js: EngineFile;
    stockfish19Wasm: EngineFile;
    stockfish19MtJs: EngineFile;
    stockfish19MtWasm: EngineFile;
    stockfish19FullJs: EngineFile;
    stockfish19FullWasm: EngineFile;
    stockfish19FullMtJs: EngineFile;
    stockfish19FullMtWasm: EngineFile;
    maiaModel: EngineFile;
    maia23Model: EngineFile;
    lc0Model: EngineFile;
    ortWasm: EngineFile;
    ortMjs: EngineFile;
    ortGpuWasm: EngineFile;
    ortGpuMjs: EngineFile;
  };
}
