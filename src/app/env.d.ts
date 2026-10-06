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
    maiaModel: EngineFile;
    ortWasm: EngineFile;
  };
}
