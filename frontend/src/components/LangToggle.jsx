import React from "react";
import { useLang } from "../i18n";

// Small RU / EN segmented switch.
export default function LangToggle() {
  const { lang, setLang } = useLang();
  return (
    <div className="lang-toggle" role="group" aria-label="Language">
      <button className={lang === "ru" ? "active" : ""} onClick={() => setLang("ru")}>RU</button>
      <button className={lang === "en" ? "active" : ""} onClick={() => setLang("en")}>EN</button>
    </div>
  );
}
