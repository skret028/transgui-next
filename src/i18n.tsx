// Lightweight i18n: English source strings are the keys, so locale files can be
// produced from transgui's original `lang/transgui.*` files (whose keys are the
// English source text too). See scripts/import-transgui-lang.mjs.
//
// The default locale (zh-CN) is bundled eagerly so the first paint is already
// translated; every other locale is fetched on demand, so shipping all 28
// translations does not inflate the initial bundle.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Dict = Record<string, string>;

/** Locale code -> display name. `en` needs no file (the key is the fallback). */
export const LOCALES: { code: string; label: string }[] = [
  { code: "zh-CN", label: "简体中文" },
  { code: "zh-TW", label: "繁體中文" },
  { code: "en", label: "English" },
  { code: "de", label: "Deutsch" },
  { code: "fr", label: "Français" },
  { code: "es", label: "Español" },
  { code: "ru", label: "Русский" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
  { code: "pt_BR", label: "Português (Brasil)" },
  { code: "it", label: "Italiano" },
  { code: "nl", label: "Nederlands" },
  { code: "pl", label: "Polski" },
  { code: "tr", label: "Türkçe" },
  { code: "uk", label: "Українська" },
];

type Mod = { default: Dict } | Dict;

function normalize(mod: Mod): Dict {
  const m = mod as { default?: Dict };
  return (m.default ?? (mod as Dict)) as Dict;
}

function codeOf(path: string): string {
  return path.replace("./locales/", "").replace(".json", "");
}

// Default locale is bundled; the rest stay as lazy importers.
const eagerDefault = import.meta.glob<Mod>("./locales/zh-CN.json", { eager: true });
const lazyRest = import.meta.glob<Mod>("./locales/*.json");

const DICTS: Record<string, Dict> = {};
for (const [path, mod] of Object.entries(eagerDefault)) {
  DICTS[codeOf(path)] = normalize(mod);
}

function knownLocales(): string[] {
  return Object.keys(lazyRest).map(codeOf);
}

export const DEFAULT_LOCALE = "zh-CN";

export function availableLocales(): { code: string; label: string }[] {
  // Keep the curated order, then append translated locales we ship but did not list.
  const listed = new Set(LOCALES.map((l) => l.code));
  const extra = knownLocales()
    .filter((c) => !listed.has(c) && c !== "en")
    .sort()
    .map((c) => ({ code: c, label: c }));
  return [...LOCALES, ...extra];
}

async function ensureLocale(locale: string): Promise<boolean> {
  if (locale === "en" || DICTS[locale]) return true;
  const loader = lazyRest[`./locales/${locale}.json`];
  if (!loader) return false;
  DICTS[locale] = normalize(await loader());
  return true;
}

export function translate(locale: string, key: string, vars?: Record<string, string | number>): string {
  const dict = DICTS[locale];
  let out = (dict && dict[key]) || key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      out = out.split(`{${k}}`).join(String(v));
    }
  }
  return out;
}

interface Ctx {
  locale: string;
  setLocale: (l: string) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<Ctx>({
  locale: DEFAULT_LOCALE,
  setLocale: () => undefined,
  t: (key) => key,
});

export function I18nProvider({
  children,
  locale,
  onLocaleChange,
}: {
  children: ReactNode;
  locale: string;
  onLocaleChange: (l: string) => void;
}) {
  // Bumped once a lazily-loaded dictionary arrives, so the tree re-renders.
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void ensureLocale(locale).then((ok) => {
      if (ok && !cancelled) setRevision((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locale, revision],
  );

  const value = useMemo<Ctx>(
    () => ({ locale, setLocale: onLocaleChange, t }),
    [locale, onLocaleChange, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): Ctx {
  return useContext(I18nContext);
}

/** Convenience hook when only the translate function is needed. */
export function useT() {
  const { t } = useI18n();
  return t;
}

/** Guard so an unknown saved locale does not blank the UI. */
export function normalizeLocale(code: string | undefined): string {
  if (!code) return DEFAULT_LOCALE;
  if (code === "en") return "en";
  return knownLocales().includes(code) ? code : DEFAULT_LOCALE;
}
