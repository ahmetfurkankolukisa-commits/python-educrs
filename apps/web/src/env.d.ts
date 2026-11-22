interface ImportMetaEnv {
  /** Sandbox site origin, e.g. https://educrs-python-run.pages.dev (must be a different site). */
  readonly PUBLIC_RUN_ORIGIN?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
