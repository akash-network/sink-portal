import { loadConfig } from "./config";
import { createPortalServer } from "./http";
import { logFailure } from "./proxy";

async function main() {
  const config = await loadConfig();
  const server = createPortalServer(config);
  server.listen(config.port, config.host, () => {
    console.log(
      JSON.stringify({
        event: "portal-listening",
        host: config.host,
        port: config.port,
      }),
    );
  });
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      server.close();
      setTimeout(() => server.closeAllConnections(), 5_000).unref();
    });
  }
}

void main().catch((error) => {
  logFailure("portal-startup-failed", error);
  console.error(
    "Check PORTAL_CONFIG (default: portal.config.json) against server/config.example.json.",
  );
  process.exitCode = 1;
});
