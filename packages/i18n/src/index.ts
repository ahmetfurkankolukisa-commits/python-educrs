import en from "../locales/en.json" with { type: "json" };

export type MessageKey = keyof typeof en;
export type Locale = "en";
type Vars = Readonly<Record<string, string | number>>;

const catalogs: Readonly<Record<Locale, Readonly<Record<MessageKey, string>>>> = { en };

/** Replace {name} placeholders. Unknown placeholders are left visible so they get noticed. */
export function format(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}

export function createT(locale: Locale = "en") {
  const catalog = catalogs[locale];
  return (key: MessageKey, vars?: Vars): string => format(catalog[key], vars);
}

export const t = createT("en");

/** Keys that exist as `<base>.one` AND `<base>.other` (English plural forms). */
export type PluralKey = {
  [K in MessageKey]: K extends `${infer B}.other` ? (`${B}.one` extends MessageKey ? B : never) : never;
}[MessageKey];

/** Picks `<key>.one` or `<key>.other` for `n` by the locale's plural rules; `{n}` is filled in. */
export function createPlural(locale: Locale = "en") {
  const tr = createT(locale);
  const rules = new Intl.PluralRules(locale);
  return (key: PluralKey, n: number, vars?: Vars): string =>
    tr(`${key}.${rules.select(n) === "one" ? "one" : "other"}` as MessageKey, { n, ...vars });
}

export const plural = createPlural("en");
export const locales = Object.keys(catalogs) as Locale[];
export function catalog(locale: Locale): Readonly<Record<MessageKey, string>> {
  return catalogs[locale];
}
