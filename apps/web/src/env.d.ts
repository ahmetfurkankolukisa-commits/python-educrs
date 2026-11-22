interface ImportMetaEnv {
  /** Sandbox site origin, e.g. https://python-educrs-run.<account>.workers.dev (must be a different site). Required at build. */
  readonly PUBLIC_RUN_ORIGIN?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
