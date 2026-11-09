import { spawn } from "node:child_process";

const children = [
  spawn(
    process.execPath,
    [
      "--env-file-if-exists=.env.local",
      "--watch",
      "--import",
      "tsx",
      "server/index.ts",
    ],
    { stdio: "inherit" },
  ),
  spawn(process.execPath, ["node_modules/vite/bin/vite.js"], {
    stdio: "inherit",
  }),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill("SIGTERM");
}
for (const child of children) {
  child.on("error", (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on("exit", (code) => stop(code ?? 1));
}
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => stop());
