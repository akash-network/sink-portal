import { ArrowRight, TriangleAlert } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";

export const termsVersion = "2.1";
export const termsStorageKey = "akash-migrate-terms";

export function hasAcceptedTerms() {
  try {
    return localStorage.getItem(termsStorageKey) === termsVersion;
  } catch {
    return false;
  }
}

export function TermsDialog({ onAccept }: { onAccept: () => void }) {
  const accept = () => {
    try {
      localStorage.setItem(termsStorageKey, termsVersion);
    } catch {
      // Consent still applies to this visit when browser storage is unavailable.
    }
    onAccept();
  };
  return (
    <Dialog open>
      <DialogContent
        className="ab max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto sm:max-w-[480px]"
        showCloseButton={false}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <DialogHeader className="gap-2 text-left">
          <div className="mb-2 flex size-11 items-center justify-center rounded-full border border-[var(--bd)] bg-[var(--muted)]">
            <TriangleAlert className="size-5" aria-hidden="true" />
          </div>
          <DialogTitle className="display text-2xl leading-8">
            Before you migrate
          </DialogTitle>
          <DialogDescription className="leading-6">
            A few things to know before moving your AKT to Solana.
          </DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-4">
          <li className="flex items-start gap-3">
            <ArrowRight className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-semibold">It’s one-way.</p>
              <p className="mt-1 leading-5 text-[var(--mfg)]">
                AKT moved to Solana can’t be moved back through this portal or
                currently be staked.
              </p>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <ArrowRight className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-semibold">There is a risk of loss.</p>
              <p className="mt-1 leading-5 text-[var(--mfg)]">
                Software, network or wallet failures can result in losing some
                or all of your funds. Check your destination carefully.
              </p>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <ArrowRight className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-semibold">Timing isn’t guaranteed.</p>
              <p className="mt-1 leading-5 text-[var(--mfg)]">
                Transfers can be delayed. Refunds depend on protocol rules and
                aren’t available after a successful mint.
              </p>
            </div>
          </li>
        </ul>
        <p className="border-t border-[var(--bd)] pt-4 text-[13px] leading-5 text-[var(--mfg)]">
          By selecting “I agree and continue,” you accept the{" "}
          <a
            className="lnk"
            href="/terms-of-service.html"
            target="_blank"
            rel="noopener noreferrer"
          >
            Terms of Service
          </a>{" "}
          and acknowledge the{" "}
          <a
            className="lnk"
            href="/terms.html"
            target="_blank"
            rel="noopener noreferrer"
          >
            migration risks
          </a>
          .
        </p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            className="btn btn-pri btn-lg w-full"
            onClick={accept}
          >
            I agree and continue
          </button>
          <a
            className="lnk flex min-h-11 items-center justify-center"
            href="https://akash.network/"
          >
            Leave portal
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}
