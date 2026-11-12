import { TriangleAlert } from "lucide-react";

export function MigrationBanner() {
  return (
    <aside
      aria-label="Migration notice"
      className="border-b border-[#333] bg-[#101010] text-white"
    >
      <div className="wrap flex items-start justify-center gap-3 py-3 text-sm leading-5">
        <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <p>
          <strong className="font-semibold">Migration is one-way.</strong> AKT
          moved to Solana can’t be moved back, and{" "}
          <strong className="font-semibold">can’t be staked</strong> until the
          new tokenomics launch (coming soon).
        </p>
      </div>
    </aside>
  );
}
