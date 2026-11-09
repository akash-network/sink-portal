import { useState, useEffect } from "react";
import { readTheme, applyTheme, themeKey, parseTheme } from "./theme";

export function ThemeControl() {
  const [theme, setTheme] = useState(readTheme);
  useEffect(() => {
    applyTheme(theme);
    const media = matchMedia("(prefers-color-scheme: dark)");
    const update = () => applyTheme(theme);
    const sync = (event: StorageEvent) => {
      if (event.key === themeKey) setTheme(parseTheme(event.newValue));
    };
    media.addEventListener("change", update);
    window.addEventListener("storage", sync);
    return () => {
      media.removeEventListener("change", update);
      window.removeEventListener("storage", sync);
    };
  }, [theme]);
  return (
    <>
      <label htmlFor="theme-mode" className="sr">
        Color theme
      </label>
      <select
        id="theme-mode"
        className="sel"
        value={theme}
        onChange={(event) => {
          const next = parseTheme(event.target.value);
          setTheme(next);
          try {
            localStorage.setItem(themeKey, next);
          } catch {
            /* Theme still works without persistence. */
          }
        }}
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </>
  );
}
