// The colour theme the learner chose (docs/05-f3-mvp0.md §17.18).
//
// The truth is a `settings.changed { theme }` event. Events can only be read once the scripts have
// loaded, which is after the first paint — so the choice is also MIRRORED in localStorage, and a
// few lines in <head> (PRE_PAINT, below) apply it before anything is drawn. Every page that reads
// the events puts the mirror right again (applyTheme in openProgress).
import type { Theme } from "@educrs/gamification";

export const THEME_KEY = "educrs:theme";

/** The browser bar's colour for a chosen theme: that theme's page background (tokens.css, --color-bg). */
export const BAR: Readonly<Record<Exclude<Theme, "system">, string>> = {
  light: "#fff8f1",
  dark: "#16132b",
  "high-contrast": "#000000",
};

/**
 * Runs in <head>, before the first paint, as an inline script (its hash goes into the CSP at build
 * time). Old-style JavaScript on purpose: it must run everywhere and fail silently. The stored
 * value is looked up as an OWN key: "constructor" is on every object, and is not a theme.
 */
export const PRE_PAINT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)}),b=${JSON.stringify(BAR)};if(!Object.prototype.hasOwnProperty.call(b,t))return;var c=b[t];document.documentElement.setAttribute("data-theme",t);var m=document.querySelectorAll('meta[name="theme-color"]');for(var i=0;i<m.length;i++)m[i].setAttribute("content",c)}catch(e){}})();`;

/** Apply a theme to this page now, and mirror it for the next page's first paint. */
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const own = meta.dataset.default;
    if (own) meta.content = theme === "system" ? own : BAR[theme];
  }
  try {
    if (theme === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, theme);
  } catch {
    // No storage (some private windows): the theme still applies on pages that read the events.
  }
}
