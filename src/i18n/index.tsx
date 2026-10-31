import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getSettings } from "../api";
import { applyDensity, setGithubToken, setHaptics, setRegistryChannel, setTranslator, substitute } from "../utils";
import { en, type MessageKey, type TFunc } from "./en";
import { uk } from "./uk";
import { ru } from "./ru";
import { es } from "./es";
import { de } from "./de";
import { fr } from "./fr";
import { ja } from "./ja";
import { zh } from "./zh";
import { ko } from "./ko";
import { pt } from "./pt";
import { zhTW } from "./zhTW";
import { it } from "./it";
import { pl } from "./pl";
import { tr } from "./tr";
import { nl } from "./nl";
import { cs } from "./cs";
import { ptPT } from "./ptPT";

type Locale = "en" | "uk" | "ru" | "es" | "de" | "fr" | "pt" | "pt-PT" | "it" | "pl" | "tr" | "nl" | "cs" | "ja" | "ko" | "zh" | "zh-TW";

export const LOCALES: { code: Locale; label: string }[] = [
  { code: "en", label: "English" },
  { code: "uk", label: "Українська" },
  { code: "ru", label: "Русский" },
  { code: "es", label: "Español" },
  { code: "de", label: "Deutsch" },
  { code: "fr", label: "Français" },
  { code: "pt", label: "Português (Brasil)" },
  { code: "pt-PT", label: "Português (Portugal)" },
  { code: "it", label: "Italiano" },
  { code: "pl", label: "Polski" },
  { code: "tr", label: "Türkçe" },
  { code: "nl", label: "Nederlands" },
  { code: "cs", label: "Čeština" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
  { code: "zh", label: "简体中文" },
  { code: "zh-TW", label: "繁體中文" },
];

const MESSAGES: Record<Locale, Record<MessageKey, string>> = { en, uk, ru, es, de, fr, pt, "pt-PT": ptPT, it, pl, tr, nl, cs, ja, ko, zh, "zh-TW": zhTW };

export const LOCALE_CHANGED = "deckyhub-locale-changed";

function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && value in MESSAGES;
}

function detectLocale(): Locale {
  for (const raw of navigator.languages ?? [navigator.language]) {
    const tag = raw.toLowerCase();
    // Taiwan, Hong Kong, Macau and any "Hant" tag read Traditional Chinese.
    if (/^zh-(tw|hk|mo|hant)/.test(tag)) return "zh-TW";
    if (tag.startsWith("pt-pt")) return "pt-PT";
    const code = tag.split("-")[0];
    if (isLocale(code)) return code;
  }
  return "en";
}

const I18nContext = createContext<TFunc | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<string>("auto");

  useEffect(() => {
    // Every route mounts its own I18nProvider instance (see index.tsx), so
    // this doubles as the one place that primes the GitHub token for every
    // api.github.com call in this tree — see setGithubToken() in github.ts.
    // SettingsPage re-dispatches LOCALE_CHANGED whenever the token changes
    // too, not just the language, so this re-syncs both on save.
    const refresh = () =>
      void getSettings().then((settings) => {
        setPreference(settings.language || "auto");
        setGithubToken(settings.githubToken || "");
        setRegistryChannel(settings.registryChannel);
        applyDensity(settings.density);
        setHaptics(settings.haptics !== false);
      });
    refresh();
    window.addEventListener(LOCALE_CHANGED, refresh);
    return () => window.removeEventListener(LOCALE_CHANGED, refresh);
  }, []);

  const locale = preference === "auto" ? detectLocale() : isLocale(preference) ? preference : "en";
  const t: TFunc = (key, vars) => substitute(MESSAGES[locale][key], vars);

  useEffect(() => setTranslator(t), [locale]);

  return <I18nContext.Provider value={t}>{children}</I18nContext.Provider>;
}

export function useT(): TFunc {
  const t = useContext(I18nContext);
  if (!t) throw new Error("useT must be used within I18nProvider");
  return t;
}
