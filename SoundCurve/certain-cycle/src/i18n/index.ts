// MathSonify i18n engine — zero-dependency, client-side
// Usage (Astro static):  setLang('es') → applyStaticTranslations()
// Usage (React):         const { t } = useTranslation()

import en from './translations/en';
import es from './translations/es';
import pt from './translations/pt';
import fr from './translations/fr';
import de from './translations/de';
import ja from './translations/ja';
import zh from './translations/zh';
import ko from './translations/ko';
import ar from './translations/ar';
import it from './translations/it';
import no from './translations/no';
import da from './translations/da';
import nl from './translations/nl';
import sv from './translations/sv';
import fi from './translations/fi';
import ga from './translations/ga';
import mi from './translations/mi';
import ms from './translations/ms';
import ta from './translations/ta';
import lb from './translations/lb';

export type Lang =
  | 'en' | 'es' | 'pt' | 'fr' | 'de' | 'ja' | 'zh' | 'ko' | 'ar'
  | 'it' | 'no' | 'da' | 'nl' | 'sv' | 'fi' | 'ga' | 'mi' | 'ms' | 'ta' | 'lb';
export type TranslationKey = keyof typeof en;

const FALLBACK_LANG: Lang = 'en';
export const LANG_KEY = 'mathsonify-lang';
export const LANG_CHANGE_EVENT = 'mathsonify:langchange';

export const LANGUAGES: { code: Lang; native: string }[] = [
  { code: 'en', native: 'English' },
  { code: 'es', native: 'Español' },
  { code: 'pt', native: 'Português' },
  { code: 'fr', native: 'Français' },
  { code: 'de', native: 'Deutsch' },
  { code: 'it', native: 'Italiano' },
  { code: 'no', native: 'Norsk bokmål' },
  { code: 'da', native: 'Dansk' },
  { code: 'nl', native: 'Nederlands' },
  { code: 'sv', native: 'Svenska' },
  { code: 'fi', native: 'Suomi' },
  { code: 'ga', native: 'Gaeilge' },
  { code: 'mi', native: 'Māori' },
  { code: 'ms', native: 'Bahasa Melayu' },
  { code: 'ta', native: 'தமிழ்' },
  { code: 'lb', native: 'Lëtzebuergesch' },
  { code: 'ja', native: '日本語' },
  { code: 'zh', native: '中文' },
  { code: 'ko', native: '한국어' },
  { code: 'ar', native: 'العربية' },
];

const DICTS: Record<Lang, Record<string, string>> = { en, es, pt, fr, de, ja, zh, ko, ar, it, no, da, nl, sv, fi, ga, mi, ms, ta, lb } as Record<Lang, Record<string, string>>;

export function isValidLang(v: string): v is Lang {
  return v in DICTS;
}

export function getLang(): Lang {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return FALLBACK_LANG;
  try {
    const v = localStorage.getItem(LANG_KEY);
    if (v && isValidLang(v)) return v;
  } catch { /* ignore */ }
  return FALLBACK_LANG;
}

export function setLang(lang: Lang): void {
  if (!isValidLang(lang)) return;
  try { localStorage.setItem(LANG_KEY, lang); } catch { /* ignore */ }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }
  applyStaticTranslations(lang);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(LANG_CHANGE_EVENT, { detail: lang }));
  }
}

export function t(key: TranslationKey, lang?: Lang): string {
  const l = lang ?? getLang();
  const dict = DICTS[l] ?? DICTS[FALLBACK_LANG];
  return dict[key] ?? (DICTS[FALLBACK_LANG] as Record<string, string>)[key] ?? key;
}

// Scan the page for [data-i18n] and replace textContent / placeholders
export function applyStaticTranslations(lang?: Lang): void {
  if (typeof document === 'undefined') return;
  const l = lang ?? getLang();
  const dict = DICTS[l] ?? DICTS[FALLBACK_LANG];
  const fallback = DICTS[FALLBACK_LANG] as Record<string, string>;

  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n;
    if (!key) return;
    const val = dict[key] ?? fallback[key];
    if (val == null) return;
    // If element has data-i18n-attr set, set that attribute instead of textContent
    const attr = el.dataset.i18nAttr;
    if (attr) {
      el.setAttribute(attr, val);
    } else {
      el.textContent = val;
    }
  });

  // Handle placeholders
  document.querySelectorAll<HTMLElement>('[data-i18n-placeholder]').forEach((el) => {
    const key = el.dataset.i18nPlaceholder;
    if (!key) return;
    const val = dict[key] ?? fallback[key];
    if (val != null) el.setAttribute('placeholder', val);
  });
}

// React hook
import { useState, useEffect, useCallback } from 'react';

export function useTranslation() {
  const [lang, setLangState] = useState<Lang>(() => getLang());

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<Lang>).detail;
      if (detail && isValidLang(detail)) setLangState(detail);
    };
    window.addEventListener(LANG_CHANGE_EVENT, handler);
    return () => window.removeEventListener(LANG_CHANGE_EVENT, handler);
  }, []);

  const translate = useCallback(
    (key: TranslationKey): string => {
      const dict = DICTS[lang] ?? DICTS[FALLBACK_LANG];
      return dict[key] ?? (DICTS[FALLBACK_LANG] as Record<string, string>)[key] ?? key;
    },
    [lang]
  );

  return { t: translate, lang, setLang };
}
