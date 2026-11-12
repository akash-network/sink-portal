import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { transferEstimate, stageGuide } from "./transfers";

export function Faq() {
  const [open, setOpen] = useState(0);
  const items = [
    {
      q: "Can I move AKT from Solana back to Akash?",
      a: "No. Akash Sink only moves AKT from Akash to Solana. Once AKT arrives on Solana, it can’t be transferred back through Akash Sink.",
    },
    {
      q: "How long does a transfer take?",
      a: (
        <>
          <p>
            Estimated transfer time: {transferEstimate}. You can close this page
            and the transfer keeps going. Each transfer moves through four
            stages:
          </p>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
            {stageGuide.map((stage) => (
              <li key={stage.label}>
                <span className="font-medium text-[var(--fg)]">
                  {stage.label}
                </span>
                {stage.time && ` · ${stage.time}`}: {stage.detail}
              </li>
            ))}
          </ul>
        </>
      ),
    },
    {
      q: "Which Solana wallets can I send to?",
      a: "Connect Phantom, Solflare or Backpack and we fill in your address for you. The connection is read-only: you never sign anything in your Solana wallet. For a hardware wallet or a wallet on another device, paste the address instead.",
    },
    {
      q: "Do I need SOL to receive AKT?",
      a: "No. You don’t need SOL in your Solana wallet to receive AKT.",
    },
    {
      q: "Is there a minimum or maximum amount?",
      a: "Connect your Akash wallet to see your transfer limits, remaining allowance and reset time above the review button.",
    },
    {
      q: "What does Refunded mean?",
      a: "If transfer cannot be completed (Solana voids the transfer), your AKT will be returned back to your wallet. The Akash network fee isn’t returned. You can retry it from Your transfers.",
    },
    {
      q: "I lost my ledger ID. How do I find my transfer?",
      a: "Transfers you start in this browser are listed under Your transfers. On another device, connect the same Akash wallet account, or track it with the transaction hash from your Akash wallet activity.",
    },
  ];
  return (
    <section aria-labelledby="faq-h" className="flex flex-col gap-2">
      <h2 id="faq-h" className="display text-2xl leading-8">
        Questions
      </h2>
      <div className="faq-grid">
        {items.map((item, index) => (
          <div key={item.q} className="border-b border-[var(--bd)]">
            <button
              type="button"
              className="faq-q"
              onClick={() => setOpen(open === index ? -1 : index)}
              aria-expanded={open === index}
            >
              <span>{item.q}</span>
              <ChevronDown
                className={`ico text-[var(--mfg)] transition-transform duration-150 ${open === index ? "rotate-180" : ""}`}
                aria-hidden="true"
              />
            </button>
            {open === index && (
              <div className="muted pb-4 leading-[22px]">{item.a}</div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
