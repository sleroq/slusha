import { getContext, setContext } from "svelte";
import { translate, type TranslationKey, type WidgetLocale } from "./index";

type TranslationParams = Record<string, string | number>;
export type Translator = (
  key: TranslationKey,
  params?: TranslationParams,
) => string;

const TRANSLATOR_CONTEXT_KEY = Symbol("widget-translator");

export function setI18nContext(getLocale: () => WidgetLocale): Translator {
  const translator: Translator = (key, params) =>
    translate(getLocale(), key, params);
  setContext(TRANSLATOR_CONTEXT_KEY, translator);
  return translator;
}

export function useI18n(): Translator {
  return getContext<Translator>(TRANSLATOR_CONTEXT_KEY);
}
