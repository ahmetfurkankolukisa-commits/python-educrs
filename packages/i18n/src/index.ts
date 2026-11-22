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
export const locales = Object.keys(catalogs) as Locale[];
export function catalog(locale: Locale): Readonly<Record<MessageKey, string>> {
  return catalogs[locale];
}
