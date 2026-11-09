import { build } from "esbuild";
import type { Plugin } from "vite";

async function bundleTheme() {
  const result = await build({
    entryPoints: ["src/app/theme-init.ts"],
    bundle: true,
    write: false,
    format: "iife",
    target: "es2022",
    minify: true,
  });
  return result.outputFiles[0].text;
}

// Keep theme selection synchronous before CSS, including under script-src 'self'.
export function themeScript(): Plugin {
  return {
    name: "portal-theme",
    transformIndexHtml() {
      return [
        {
          tag: "script",
          attrs: { src: "/theme.js" },
          injectTo: "head-prepend",
        },
      ];
    },
    configureServer(server) {
      server.middlewares.use("/theme.js", async (_request, response, next) => {
        try {
          response.setHeader("Content-Type", "text/javascript");
          response.end(await bundleTheme());
        } catch (error) {
          next(error);
        }
      });
    },
    async generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "theme.js",
        source: await bundleTheme(),
      });
    },
  };
}
