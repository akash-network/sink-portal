import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const steps = [
  {
    title: "Keplr + Phantom",
    place: "Browser",
    x: 390,
    y: 65,
    lines: [
      "Approve destination · sign MsgSink",
      "No tokens move through the browser",
    ],
    detail:
      "Phantom signs an approval binding the destination, sender, amount and network. The browser verifies that signature. Keplr signs MsgSink on Akash; the transaction hash is saved before broadcast.",
  },
  {
    title: "x/sink",
    place: "Akash node",
    x: 30,
    y: 195,
    lines: [
      "Validate · escrow · create record ID",
      "Akash validators commit the app hash",
    ],
    detail:
      "Native node code checks the signer, dest_type, canonical 32-byte Solana public key, curve or vault allowlist, uakt amount, enable switch and account limits. Escrow and the immutable transfer record are written atomically. MsgSinkResponse returns its ID. No CosmWasm or external account lookup runs here.",
  },
  {
    title: "Relayer",
    place: "Off-chain worker",
    x: 390,
    y: 325,
    lines: [
      "Upload headers + signature batches",
      "Upload ICS23 sink-record proofs",
    ],
    detail:
      "The relayer reads Akash headers and provable sink state, uploads chunks to Solana, and submits mint or governance-void instructions. It also keeps the light client current and cleans up temporary buffers. It has no mint authority. Client updates require the configured RELAYER_ROLE.",
  },
  {
    title: "ics07-tendermint",
    place: "Solana smart contract",
    x: 750,
    y: 195,
    lines: ["Verify Akash consensus headers", "Store verified app hashes"],
    detail:
      "The deployed light client verifies validator signatures, voting power and trusted-set overlap from the configured checkpoint. Its stored app hash anchors ICS23 membership verification. Conflicting-header evidence freezes the client. Access-manager controls update roles; the initial checkpoint and upgrade authority remain trust assumptions.",
  },
  {
    title: "akt-solana → SPL Token",
    place: "Solana smart contracts",
    x: 750,
    y: 455,
    lines: [
      "Verify proof · check recipient · mint",
      "Permanent minted OR voided status",
    ],
    detail:
      "The mint program pins the client, chain, sink store, key and exact record bytes; checks frozen/expiry state; and calls verify_membership. It checks the recipient's account owner, curve and vault policy, derives/creates the ATA and mints 1:1 through its authority PDA. A transfer can resolve only once. Invalid recipients or proven Akash governance void orders become permanently voided. Pause and amount caps cause retries, never timeout refunds.",
  },
  {
    title: "Reporters",
    place: "Off-chain workers",
    x: 390,
    y: 585,
    lines: ["Read finalized Solana outcome", "Sign MsgReportOutcome on Akash"],
    detail:
      "Reporters check the mint program's status account and finalized transaction evidence, including slot and signature, before reporting. They cannot mint. The team testnet runs three workers against one local Solana validator; this does not provide the independent-node fault isolation required for production.",
  },
  {
    title: "x/sink settlement",
    place: "Akash node",
    x: 30,
    y: 585,
    lines: [
      "Mint quorum → completed; AKT locked",
      "Void quorum → challenge → refund",
    ],
    detail:
      "Native x/sink counts authorized reporter votes. Mint quorum closes the record while backing stays locked. Void quorum starts the challenge window; a reporter or governance can veto. Unchallenged voids refund the original sender within the refund cap. Conflicting reports freeze settlement.",
  },
  {
    title: "Supply reconciler",
    place: "Off-chain monitor",
    x: 390,
    y: 745,
    lines: [
      "Read both chains · account for burns",
      "Alert on escrow / supply mismatch",
    ],
    detail:
      "Reconciliation checks escrow behind minted transfers = Solana supply + cumulative SPL burns. Pending and voided escrow are counted separately. The monitor reports discrepancies; it does not authorize mints or refunds.",
  },
] as const;

export function BridgeFlow() {
  const [selected, setSelected] = useState(4);
  const step = steps[selected];
  return (
    <Card id="bridge-flow" className="min-w-0 gap-4 rounded-xl">
      <CardHeader className="gap-2">
        <CardTitle className="text-base">Transfer lifecycle</CardTitle>
        <p className="text-sm text-muted-foreground">
          Select a component to see its checks. AKT moves one way; the return
          path reports the outcome.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          className="overflow-x-auto rounded-lg border bg-muted/20"
          tabIndex={0}
          aria-label="Scrollable transfer diagram"
        >
          <svg
            viewBox="0 0 1080 870"
            className="min-w-[860px] w-full"
            aria-label="Akash to Solana transfer and return confirmation"
          >
            <defs>
              <marker
                id="flow-arrow"
                markerWidth="7"
                markerHeight="7"
                refX="6"
                refY="3.5"
                orient="auto"
              >
                <path d="M0,0 L7,3.5 L0,7 Z" fill="currentColor" />
              </marker>
            </defs>
            {["Akash", "Off-chain processes", "Solana"].map((name, i) => (
              <text
                key={name}
                x={180 + i * 360}
                y="32"
                textAnchor="middle"
                className="fill-foreground text-sm font-semibold"
              >
                {name}
              </text>
            ))}
            <g
              className="text-muted-foreground"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              markerEnd="url(#flow-arrow)"
            >
              <path d="M390 115 H180 V195" />
              <path d="M180 295 V375 H390" />
              <path d="M690 350 H720 V245 H750" />
              <path d="M690 395 H720 V505 H750" />
              <path d="M900 295 V455" />
              <path d="M900 555 V635 H690" />
              <path d="M390 635 H330" />
              <path d="M180 685 V795 H390" strokeDasharray="5 5" />
              <path d="M900 555 V795 H690" strokeDasharray="5 5" />
            </g>
            <g className="fill-muted-foreground text-xs">
              <text x="190" y="105">
                Signed deposit
              </text>
              <text x="190" y="363">
                Committed state
              </text>
              <text x="730" y="330">
                Headers
              </text>
              <text x="610" y="446">
                Record + ICS23 proof
              </text>
              <text x="912" y="374">
                Verified Akash state
              </text>
              <text x="748" y="619">
                Finalized evidence
              </text>
              <text x="338" y="619">
                Votes
              </text>
              <text x="750" y="782">
                Supply + burns
              </text>
              <text x="190" y="782">
                Escrow totals
              </text>
            </g>
            {steps.map((item, i) => (
              <g
                key={item.title}
                role="button"
                tabIndex={0}
                aria-pressed={selected === i}
                aria-label={`${i + 1}. ${item.title}: ${item.place}`}
                className="cursor-pointer outline-none focus-visible:[&>rect]:stroke-primary"
                onClick={() => setSelected(i)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelected(i);
                  }
                }}
              >
                <rect
                  x={item.x}
                  y={item.y}
                  width="300"
                  height="100"
                  rx="10"
                  className={
                    selected === i
                      ? "fill-accent stroke-primary"
                      : "fill-card stroke-border"
                  }
                  strokeWidth="2"
                />
                <text
                  x={item.x + 15}
                  y={item.y + 27}
                  className="fill-foreground text-sm font-semibold"
                >
                  {i + 1}. {item.title}
                </text>
                {item.lines.map((line, j) => (
                  <text
                    key={line}
                    x={item.x + 15}
                    y={item.y + 53 + j * 20}
                    className="fill-muted-foreground text-xs"
                  >
                    {line}
                  </text>
                ))}
              </g>
            ))}
          </svg>
        </div>
        <div
          id="flow-detail"
          aria-live="polite"
          className="rounded-lg border p-4"
        >
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-medium">
              {selected + 1}. {step.title}
            </h3>
            <Badge variant="outline">{step.place}</Badge>
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
            {step.detail}
          </p>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          Genesis: the AKT mint starts with zero supply. Every mint follows the
          proof path above, so all AKT on Solana is backed by AKT locked on
          Akash. Per-transfer status and the mint-authority PDA live in the
          Solana program.
        </p>
      </CardContent>
    </Card>
  );
}
