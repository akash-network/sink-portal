export type Theme = "light" | "dark" | "system";
export const themeKey = "akt-bridge-theme";
export function parseTheme(value: unknown): Theme {
  return value === "light" || value === "dark" ? value : "system";
}
export function readTheme(): Theme {
  try {
    return parseTheme(localStorage.getItem(themeKey));
  } catch {
    return "system";
  }
}
export function applyTheme(theme: Theme) {
  const dark =
    theme === "dark" ||
    (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}
