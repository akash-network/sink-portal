import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { testEnvConfig } from "./fixture/test-env.config";

// A stale build would test old code, so the local UI is rebuilt every run.
export default function globalSetup() {
  if (!testEnvConfig.E2E_LOCAL_UI) return;
  execFileSync(process.execPath, ["scripts/build.mjs"], {
    cwd: join(__dirname, ".."),
    stdio: "inherit",
  });
}
