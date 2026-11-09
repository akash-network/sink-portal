import { type ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { CopyButton } from "../../components/identifier";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "../../components/ui/card";
import { type BridgeState } from "../transfers/controller";
import { BridgeFlow } from "./bridge-flow";
import { Badge } from "../../components/ui/badge";
import { fresh } from "../../lib/model";
import { Label } from "../../components/ui/label";

function Definitions({ id, rows }: { id?: string; rows: [string, string][] }) {
  return (
    <dl id={id} className="divide-y text-sm">
      {rows.map(([name, value]) => (
        <div
          key={name}
          className="grid min-w-0 gap-1 py-3 sm:grid-cols-[160px_minmax(0,1fr)] sm:gap-4"
        >
          <dt className="pt-1.5 text-muted-foreground">{name}</dt>
          <dd className="flex min-w-0 items-start gap-2">
            <code className="min-w-0 flex-1 pt-1.5 font-mono text-xs leading-5 wrap-anywhere">
              {value}
            </code>
            <CopyButton value={value} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Panel({
  title,
  children,
  action,
  id,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  id?: string;
}) {
  return (
    <Card id={id} className="min-w-0 gap-4 rounded-xl">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function Developer({ state }: { state: BridgeState }) {
  const status = state.status;
  const rows: [string, string][] = status
    ? [
        ["Chain ID", status.chainId],
        ["AKT mint address", status.mint],
        ["Solana program address", status.program],
        ["Akash sink", status.sinkAddress],
        ["Solana genesis", status.solanaGenesisHash],
        ...Object.entries(status.endpoints),
      ]
    : [];
  if (state.config && state.secure)
    rows.push(
      ["Wallet RPC", new URL(state.config.rpcPath, location.origin).href],
      ["Wallet REST", new URL(state.config.restPath, location.origin).href],
    );
  const command = status
    ? [
        "akash tx sink deposit <SOLANA_PUBLIC_KEY> 1000000uakt",
        "  --dest-type 1 --from <KEY>",
        `  --chain-id ${status.chainId}`,
        `  --node ${status.endpoints.akash}`,
        `  --fees ${state.config?.fee.amountUakt ?? "12500"}uakt --gas ${state.config?.fee.gas ?? "500000"}`,
      ].join(" \\\n")
    : "Loading…";
  const count =
    status?.services.filter((service) => service.running).length ?? 0;
  return (
    <div className="space-y-6">
      <BridgeFlow />
      <Panel
        title="Network"
        action={<Badge variant="outline">Private testnet</Badge>}
      >
        <p
          id="state"
          role="status"
          className="mb-4 text-sm text-muted-foreground"
        >
          {state.statusError ||
            (status
              ? `Akash block ${status.akashHeight} · Solana finalized slot ${status.solanaSlot} · ${count}/${status.services.length} services · Supply: ${status.reconciliation && fresh(status.reconciliation.checkedAt) ? status.reconciliation.status : "unavailable"}`
              : "Connecting…")}
        </p>
        <Definitions id="endpoints" rows={rows} />
        <details className="mt-4 rounded-lg border p-3">
          <summary className="cursor-pointer text-sm">
            Service status &amp; supply reconciliation
          </summary>
          <pre
            id="details"
            className="mt-4 max-h-96 overflow-auto font-mono text-xs"
          >
            {status ? JSON.stringify(status.raw, null, 2) : "Loading…"}
          </pre>
        </details>
      </Panel>
      <div>
        <Panel title="CLI deposit" action={<CopyButton value={command} />}>
          <pre
            id="deposit"
            className="rounded-lg bg-muted p-4 font-mono text-xs leading-6 whitespace-pre-wrap wrap-anywhere"
          >
            {command}
          </pre>
          <p className="mt-3 text-xs text-muted-foreground">
            1 AKT = 1,000,000 uakt
          </p>
          <Label className="mt-5 mb-2">Query a record</Label>
          <code className="font-mono text-xs wrap-anywhere">
            akash query sink record &lt;id&gt;
          </code>
        </Panel>
      </div>
      <a
        href="https://github.com/akash-network/sink-portal"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-sm font-medium underline"
      >
        Repository
        <ExternalLink className="ico size-3.5" aria-hidden="true" />
      </a>
    </div>
  );
}
