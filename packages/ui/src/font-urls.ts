/**
 * URLs of the font files worth preloading (docs/05-f3-mvp0.md §17.7): the Latin subset of Lexend,
 * used by every page. Vite emits the same hashed file the @font-face rule in fonts.css points at,
 * so the preload is used, not downloaded twice (e2e checks it). Code font: not preloaded.
 */
export { default as lexendLatin } from "@fontsource-variable/lexend/files/lexend-latin-wght-normal.woff2?url";
