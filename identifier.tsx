import { useEffect, useState } from "react";
import { Check, Copy, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { shortenIdentifier } from "./transfers";

export function CopyButton({
  value,
  compact = false,
}: {
  value: string;
  compact?: boolean;
}) {
  const [result, setResult] = useState("");
  useEffect(() => {
    if (!result) return;
    const timer = setTimeout(() => setResult(""), 1800);
    return () => clearTimeout(timer);
  }, [result]);
  return (
    <Button
      type="button"
      variant="ghost"
      size={compact ? "icon-xs" : "sm"}
      className="shrink-0 text-muted-foreground"
      aria-label={result || `Copy ${value}`}
      title={result || "Copy"}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setResult("Copied");
        } catch {
          setResult("Copy unavailable");
        }
      }}
    >
      {result === "Copied" ? <Check /> : <Copy />}
      {!compact && (
        <span className="sr-only sm:not-sr-only">{result || "Copy"}</span>
      )}
      <span className="sr-only" role="status">
        {result}
      </span>
    </Button>
  );
}

export function Identifier({
  value,
  href,
  label,
}: {
  value: string;
  href?: string;
  label?: string;
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1 text-xs">
      {href ? (
        <a
          href={href}
          title={value}
          aria-label={label ?? `View transaction ${value}`}
          className="inline-flex items-center gap-1 rounded-sm font-mono text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring"
        >
          {shortenIdentifier(value)}
          <ArrowUpRight className="size-3" aria-hidden="true" />
        </a>
      ) : (
        <code title={value} className="text-muted-foreground">
          {shortenIdentifier(value)}
        </code>
      )}
      <CopyButton value={value} compact />
    </span>
  );
}
