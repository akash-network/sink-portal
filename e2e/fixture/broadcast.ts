import { createHash } from "node:crypto";
import type { Page, Route } from "@playwright/test";

// "accept" and "reject" answer inside the browser, and "drop" fails the request
// before it leaves: none of them reach the chain. "forward-and-drop" sends the
// transaction for real and then hides the node's reply from the page.
export type BroadcastMode =
  "observe" | "accept" | "reject" | "drop" | "forward-and-drop";

export interface Broadcasts {
  hashes: string[];
}

export async function handleBroadcasts(
  page: Page,
  mode: BroadcastMode,
): Promise<Broadcasts> {
  const broadcasts: Broadcasts = { hashes: [] };
  await page.route("**/rpc/akash", async (route) => {
    const payload = route.request().postDataJSON();
    if (!String(payload?.method).startsWith("broadcast_tx"))
      return route.fallback();
    const hash = createHash("sha256")
      .update(Buffer.from(payload.params.tx, "base64"))
      .digest("hex")
      .toUpperCase();
    broadcasts.hashes.push(hash);
    await respond(route, mode, payload.id, hash);
  });
  return broadcasts;
}

async function respond(
  route: Route,
  mode: BroadcastMode,
  id: unknown,
  hash: string,
) {
  if (mode === "observe") return route.continue();
  if (mode === "drop") return route.abort("failed");
  if (mode === "forward-and-drop") {
    await route.fetch();
    return route.abort("failed");
  }
  await route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      result:
        mode === "accept"
          ? { code: 0, data: "", log: "[]", codespace: "", hash }
          : {
              code: 5,
              data: "",
              log: "insufficient funds",
              codespace: "sdk",
              hash,
            },
    }),
  });
}
