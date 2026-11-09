import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/postcss";
import { defineConfig, loadEnv, type UserConfig } from "vite";
import { themeScript } from "./scripts/theme-plugin.mts";

const inject = {
  Buffer: ["buffer", "Buffer"],
  process: ["process", "default"],
} satisfies Record<string, [string, string]>;

export default defineConfig(({ mode }): UserConfig => {
  const env = loadEnv(mode, process.cwd(), ["PORTAL_", "WALLETCONNECT_"]);
  const proxy = Object.fromEntries(
    ["/api", "/rpc", "/rest"].map((path) => [
      path,
      {
        target: env.PORTAL_API_URL || "http://127.0.0.1:8080",
        changeOrigin: true,
      },
    ]),
  );

  return {
    plugins: [react(), themeScript()],
    cacheDir: ".cache/vite",
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
        stream: "stream-browserify",
      },
    },
    define: {
      WALLETCONNECT_PROJECT_ID: JSON.stringify(
        env.WALLETCONNECT_PROJECT_ID ?? "56efcfb5328b74b47d3caf9c2f44acd9",
      ),
    },
    css: { postcss: { plugins: [tailwind()] } },
    optimizeDeps: {
      entries: ["index.html"],
      rolldownOptions: { transform: { inject } },
    },
    server: {
      host: "127.0.0.1",
      proxy,
      watch: { ignored: ["**/.cache/**"] },
    },
    preview: { host: "127.0.0.1", proxy },
    build: {
      target: "es2022",
      cssCodeSplit: false,
      rolldownOptions: {
        transform: { inject },
        output: {
          entryFileNames: "app.js",
          chunkFileNames: "chunks/[name]-[hash].js",
          assetFileNames: (asset) =>
            asset.names.some((name) => name.endsWith(".css"))
              ? "app.css"
              : "assets/[name]-[hash][extname]",
        },
      },
    },
  };
});
