import React, { createContext, useContext, useState, useCallback } from "react";
import { DICT } from "./translations";

const LangCtx = createContext({ lang: "ru", setLang: () => {} });
const STORE_KEY = "chronoscope-lang";

function initialLang() {
  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (saved === "ru" || saved === "en") return saved;
  } catch { /* ignore */ }
  return "ru";
}

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(initialLang);
  const setLang = useCallback((l) => {
    setLangState(l);
    try { localStorage.setItem(STORE_KEY, l); } catch { /* ignore */ }
    try { document.documentElement.lang = l; } catch { /* ignore */ }
  }, []);
  return <LangCtx.Provider value={{ lang, setLang }}>{children}</LangCtx.Provider>;
}

export function useLang() {
  const { lang, setLang } = useContext(LangCtx);
  return { lang, setLang, toggle: () => setLang(lang === "ru" ? "en" : "ru") };
}

// t(russianString, params?) -> translated string with {name} placeholders filled.
export function useT() {
  const { lang } = useContext(LangCtx);
  return useCallback((s, params) => {
    let out = lang === "en" ? (DICT[s] ?? s) : s;
    if (params) {
      for (const k of Object.keys(params)) {
        out = out.split("{" + k + "}").join(String(params[k]));
      }
    }
    return out;
  }, [lang]);
}

// Locale-aware number formatting.
export function useNum() {
  const { lang } = useContext(LangCtx);
  return useCallback((n) => {
    try { return Number(n).toLocaleString(lang === "en" ? "en-US" : "ru-RU"); }
    catch { return String(n); }
  }, [lang]);
}
