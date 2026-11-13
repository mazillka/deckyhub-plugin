import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getSettings } from "../api";
import {
  applyDensity,
  applyOled,
  setGithubToken,
  setHaptics,
  setRegistryChannel,
  setTranslator,
  substitute,
} from "../utils";
import { setUiStyle } from "../uiStyle";
import { en, type MessageKey, type TFunc } from "./en";

type Locale =
  | "en"
  | "uk"
  | "ru"
  | "es"
  | "de"
  | "fr"
  | "pt"
  | "pt-PT"
  | "it"
  | "pl"
  | "tr"
  | "nl"
  | "cs"
  | "ja"
  | "ko"
  | "zh"
  | "zh-TW";

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

type Messages = Record<MessageKey, string>;

// English stays in the main bundle (it is the fallback); every other language is its own
// chunk, fetched only when it is the active one. A failed fetch leaves English showing.
const LOADERS: Record<Exclude<Locale, "en">, () => Promise<Messages>> = {
  uk: () => import("./uk").then((m) => m.uk),
  ru: () => import("./ru").then((m) => m.ru),
  es: () => import("./es").then((m) => m.es),
  de: () => import("./de").then((m) => m.de),
  fr: () => import("./fr").then((m) => m.fr),
  pt: () => import("./pt").then((m) => m.pt),
  "pt-PT": () => import("./ptPT").then((m) => m.ptPT),
  it: () => import("./it").then((m) => m.it),
  pl: () => import("./pl").then((m) => m.pl),
  tr: () => import("./tr").then((m) => m.tr),
  nl: () => import("./nl").then((m) => m.nl),
  cs: () => import("./cs").then((m) => m.cs),
  ja: () => import("./ja").then((m) => m.ja),
  ko: () => import("./ko").then((m) => m.ko),
  zh: () => import("./zh").then((m) => m.zh),
  "zh-TW": () => import("./zhTW").then((m) => m.zhTW),
};

// Shared by every route's provider so each language loads once.
const loaded = new Map<Locale, Messages>([["en", en]]);

export const LOCALE_CHANGED = "deckyhub-locale-changed";

function isLocale(value: unknown): value is Locale {
  return (typeof value === "string" && value in LOADERS) || value === "en";
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
        applyOled();
        setHaptics(settings.haptics !== false);
        setUiStyle(settings.uiStyle);
      });
    refresh();
    window.addEventListener(LOCALE_CHANGED, refresh);
    return () => window.removeEventListener(LOCALE_CHANGED, refresh);
  }, []);

  const locale = preference === "auto" ? detectLocale() : isLocale(preference) ? preference : "en";
  const [, setLoadedCount] = useState(loaded.size);

  useEffect(() => {
    if (loaded.has(locale) || locale === "en") return;
    let alive = true;
    LOADERS[locale]()
      .then((messages) => {
        loaded.set(locale, messages);
        if (alive) setLoadedCount(loaded.size);
      })
      .catch(() => undefined); // keep English
    return () => {
      alive = false;
    };
  }, [locale]);

  const messages = loaded.get(locale) ?? en;
  const t: TFunc = (key, vars) => substitute(messages[key], vars);

  useEffect(() => setTranslator(t), [messages]);

  return <I18nContext.Provider value={t}>{children}</I18nContext.Provider>;
}

export function useT(): TFunc {
  const t = useContext(I18nContext);
  if (!t) throw new Error("useT must be used within I18nProvider");
  return t;
}
