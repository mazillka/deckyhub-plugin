import { type TFunc, en } from "./i18n/en";

export function substitute(template: string, vars?: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (match, name) => String(vars?.[name] ?? match));
}

// Messages built outside any component tree (GitHub errors, the updates
// toast) use the locale I18nProvider last resolved — English until then.
export let tr: TFunc = (key, vars) => substitute(en[key], vars);

export function setTranslator(t: TFunc) {
  tr = t;
}
