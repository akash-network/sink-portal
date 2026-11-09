import { type BridgeState } from "../transfers/controller";

export function Notice({
  state,
  scope,
  id = "wallet-message",
}: {
  state: BridgeState;
  scope: "akash" | "solana";
  id?: string;
}) {
  const notice = state.notice;
  if (!notice || notice.scope !== scope) return null;
  return (
    <p
      id={id}
      role={notice.tone === "error" ? "alert" : "status"}
      className={notice.tone === "error" ? "err" : "help"}
    >
      {notice.text}
    </p>
  );
}
