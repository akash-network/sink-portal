import { applyTheme, readTheme } from "./theme";
// Runs before the stylesheet and app without an inline script or CSP exception.
applyTheme(readTheme());
