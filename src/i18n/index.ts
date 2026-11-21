import { en } from './locales/en';
import { es } from './locales/es';
import { id } from './locales/id';
import { ja } from './locales/ja';
import { zh } from './locales/zh';
import { LOCALE_OPTIONS, LocaleId, TranslationDictionary } from './types';

export const DEFAULT_LOCALE: LocaleId = LocaleId.EN;

const DICTIONARIES: Record<LocaleId, TranslationDictionary> = {
  [LocaleId.EN]: en,
  [LocaleId.ID]: id,
  [LocaleId.JA]: ja,
  [LocaleId.ZH]: zh,
  [LocaleId.ES]: es,
};

export function getTranslations(locale: LocaleId): TranslationDictionary {
  return DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
}

export { LOCALE_OPTIONS, LocaleId };
export type { HowToCardItem, LocaleOption, TranslationDictionary } from './types';
