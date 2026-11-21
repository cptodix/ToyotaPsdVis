import React, { createContext, useContext, useMemo, useState } from 'react';
import { DEFAULT_LOCALE, getTranslations, LocaleId, TranslationDictionary } from './index';

interface I18nContextValue {
  locale: LocaleId;
  setLocale: (locale: LocaleId) => void;
  t: TranslationDictionary;
}

const I18nContext = createContext<I18nContextValue>({
  locale: DEFAULT_LOCALE,
  setLocale: () => undefined,
  t: getTranslations(DEFAULT_LOCALE),
});

/**
 * Always initializes strictly to English (`LocaleId.EN`) on every page load
 * regardless of browser/OS locale settings.
 */
export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locale, setLocale] = useState<LocaleId>(DEFAULT_LOCALE);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t: getTranslations(locale),
    }),
    [locale]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}
