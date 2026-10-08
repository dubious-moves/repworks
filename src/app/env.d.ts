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
    maiaModel: EngineFile;
    ortWasm: EngineFile;
    ortMjs: EngineFile;
  };
}
