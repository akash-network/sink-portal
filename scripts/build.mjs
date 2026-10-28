import { build } from "esbuild";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

await rm("dist", { recursive: true, force: true });
await mkdir("dist");
await cp("public", "dist", { recursive: true });

await build({
  entryPoints: { app: "main.tsx", theme: "theme-init.ts" },
  tsconfig: "tsconfig.json",
  bundle: true,
  platform: "browser",
  target: "es2022",
  format: "iife",
  outdir: "dist",
  minify: true,
  sourcemap: false,
  legalComments: "eof",
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "info",
});

const css = await postcss([tailwind({ optimize: true })]).process(
  await readFile("styles.css", "utf8"),
  { from: "styles.css", to: "dist/app.css", map: false },
);
await writeFile("dist/app.css", css.css);
