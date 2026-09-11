import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getSettings } from "../api";
import { en, type MessageKey } from "./en";
import { uk } from "./uk";
import { es } from "./es";
import { de } from "./de";
import { fr } from "./fr";
import { ja } from "./ja";
import { zh } from "./zh";

export type Locale = "en" | "uk" | "es" | "de" | "fr" | "ja" | "zh";

export const LOCALES: { code: Locale; label: string }[] = [
  { code: "en", label: "English" },
  { code: "uk", label: "Українська" },
  { code: "es", label: "Español" },
  { code: "de", label: "Deutsch" },
  { code: "fr", label: "Français" },
  { code: "ja", label: "日本語" },
  { code: "zh", label: "中文" },
];

const MESSAGES: Record<Locale, Record<MessageKey, string>> = { en, uk, es, de, fr, ja, zh };

export const LOCALE_CHANGED = "deckyhub-locale-changed";

function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && value in MESSAGES;
}

function detectLocale(): Locale {
  const candidates = typeof navigator !== "undefined" && navigator.languages?.length ? navigator.languages : [typeof navigator !== "undefined" ? navigator.language : "en"];
  for (const raw of candidates) {
    const code = raw.toLowerCase().split("-")[0];
    if (isLocale(code)) return code;
  }
  return "en";
}

function translate(locale: Locale, key: MessageKey, vars?: Record<string, string | number>) {
  const template = MESSAGES[locale][key] ?? MESSAGES.en[key] ?? key;
  if (!vars) return template;
  return Object.entries(vars).reduce((text, [name, value]) => text.split(`{${name}}`).join(String(value)), template);
}

type TranslateFn = (key: MessageKey, vars?: Record<string, string | number>) => string;

const I18nContext = createContext<{ locale: Locale; t: TranslateFn } | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<string>("auto");

  useEffect(() => {
    const refresh = () => void getSettings().then((settings) => setPreference((settings as { language?: string }).language || "auto"));
    refresh();
    window.addEventListener(LOCALE_CHANGED, refresh);
    return () => window.removeEventListener(LOCALE_CHANGED, refresh);
  }, []);

  const locale = preference === "auto" ? detectLocale() : isLocale(preference) ? preference : "en";
  const t: TranslateFn = (key, vars) => translate(locale, key, vars);

  return <I18nContext.Provider value={{ locale, t }}>{children}</I18nContext.Provider>;
}

export function useT(): TranslateFn {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useT must be used within I18nProvider");
  return ctx.t;
}

export function useLocale(): Locale {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useLocale must be used within I18nProvider");
  return ctx.locale;
}
