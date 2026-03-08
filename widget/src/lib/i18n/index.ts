import en from "./locales/en";
import ru from "./locales/ru";

export const SUPPORTED_LOCALES = ["en", "ru", "uk", "pt", "hi", "id"] as const;
export type WidgetLocale = (typeof SUPPORTED_LOCALES)[number];

const DEFAULT_LOCALE: WidgetLocale = "ru";

export type TranslationKey = keyof typeof en;
type TranslationParams = Record<string, string | number>;

const DICTIONARIES: Record<WidgetLocale, Record<TranslationKey, string>> = {
  en,
  ru,
  uk: en,
  pt: en,
  hi: en,
  id: en,
};

function isSupportedLocale(value: string): value is WidgetLocale {
  return SUPPORTED_LOCALES.includes(value as WidgetLocale);
}

export function normalizeLocale(input: string | undefined): WidgetLocale {
  if (!input) {
    return DEFAULT_LOCALE;
  }

  const normalized = input.trim().toLowerCase();
  if (isSupportedLocale(normalized)) {
    return normalized;
  }

  const base = normalized.split("-")[0];
  if (isSupportedLocale(base)) {
    return base;
  }

  return DEFAULT_LOCALE;
}

export function translate(
  locale: string | undefined,
  key: TranslationKey,
  params?: TranslationParams,
): string {
  const normalized = normalizeLocale(locale);
  const template = DICTIONARIES[normalized][key] ?? en[key];

  if (!params) {
    return template;
  }

  return template.replace(/\{\s*([\w]+)\s*\}/g, (_, name: string) => {
    const value = params[name];
    return value === undefined ? "" : String(value);
  });
}

export { DEFAULT_LOCALE };
