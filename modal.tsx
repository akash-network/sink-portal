import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";

const focusable =
  'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),summary,[tabindex="0"]';

// Centered dialog from the design: fixed scrim, focus kept inside, Escape
// handled by the caller. Rendered in place so the page tokens apply.
export function Modal({
  id,
  labelledBy,
  describedBy,
  className = "",
  onEscape,
  initialFocus,
  children,
}: {
  id?: string;
  labelledBy: string;
  describedBy?: string;
  className?: string;
  onEscape: () => void;
  initialFocus?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node || node.contains(document.activeElement)) return;
    const target =
      (initialFocus && document.getElementById(initialFocus)) ||
      node.querySelector<HTMLElement>(focusable);
    target?.focus({ preventScroll: true });
  }, [initialFocus]);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onEscape();
      return;
    }
    if (event.key !== "Tab") return;
    const items = [
      ...event.currentTarget.querySelectorAll<HTMLElement>(focusable),
    ].filter((item) => item.getClientRects().length);
    if (!items.length) return;
    const first = items[0],
      last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  return (
    <div className={`scrim ${className}`}>
      <div
        ref={ref}
        id={id}
        className="card pad dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        onKeyDown={onKeyDown}
      >
        {children}
      </div>
    </div>
  );
}
