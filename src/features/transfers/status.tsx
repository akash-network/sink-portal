import { useEffect, useState, type PointerEvent } from "react";
import {
  stageGuide,
  statusSteps,
  type StatusTone,
  type TransferStatus,
} from "./transfers";

export function Dot({ tone }: { tone: StatusTone }) {
  return <span className={`dot tone-${tone}`} aria-hidden="true" />;
}
export function StatusBadge({ status }: { status: TransferStatus }) {
  return (
    <span className="badge" data-transfer-status={status.label}>
      <Dot tone={status.tone} />
      {status.label}
    </span>
  );
}
function segment(status: TransferStatus, index: number) {
  const on = !status.refunded && index + 1 <= status.step;
  return on ? (status.step === 4 ? "seg done" : "seg on") : "seg";
}

// Mouse hover explains a stage. The tip is fixed so the table and dialog
// scrollers can't clip it; the FAQ carries the same text for touch and
// screen readers, since trackers are hidden from assistive technology.
const TIP_HALF = 128;
type Tip = { index: number; x: number; y: number; below: boolean };
function useStageTip() {
  const [tip, setTip] = useState<Tip | null>(null);
  useEffect(() => {
    if (!tip) return;
    const hide = () => setTip(null);
    addEventListener("scroll", hide, true);
    addEventListener("resize", hide);
    return () => {
      removeEventListener("scroll", hide, true);
      removeEventListener("resize", hide);
    };
  }, [tip]);
  const hover = (index: number) => ({
    "data-stage": statusSteps[index],
    onPointerEnter: (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType === "touch") return;
      const rect = event.currentTarget.getBoundingClientRect();
      const below = rect.top < 112;
      setTip({
        index,
        x: Math.min(
          Math.max(rect.left + rect.width / 2, TIP_HALF + 8),
          innerWidth - TIP_HALF - 8,
        ),
        y: below ? rect.bottom + 8 : rect.top - 8,
        below,
      });
    },
    onPointerLeave: () => setTip(null),
  });
  const stage = tip && stageGuide[tip.index];
  const node = tip && stage && (
    <span
      className={`tip ${tip.below ? "below" : ""}`}
      style={{ left: tip.x, top: tip.y }}
      data-stage-tip={stage.label}
    >
      <span className="tip-h">
        {stage.label}
        {stage.time && <span className="tip-t"> · {stage.time}</span>}
      </span>
      {stage.detail}
    </span>
  );
  return [hover, node] as const;
}

// Compact tracker for table rows: one 3 px segment per step, with a taller
// hover target that doesn't change the row height.
export function MiniTracker({ status }: { status: TransferStatus }) {
  const [hover, tip] = useStageTip();
  return (
    <div className="grid w-[120px] grid-cols-4 gap-[3px]" aria-hidden="true">
      {statusSteps.map((label, index) => (
        <span key={label} className="-my-2 py-2" {...hover(index)}>
          <span className={`block h-[3px] ${segment(status, index)}`} />
        </span>
      ))}
      {tip}
    </div>
  );
}
// Labeled tracker for cards: fills one segment per step, green when received.
export function Tracker({ status }: { status: TransferStatus }) {
  const [hover, tip] = useStageTip();
  return (
    <div className="trk" aria-hidden="true">
      {statusSteps.map((label, index) => {
        const on = !status.refunded && index + 1 <= status.step;
        return (
          <div
            key={label}
            className="flex min-w-0 flex-col gap-1.5"
            {...hover(index)}
          >
            <span className={`h-1 ${segment(status, index)}`} />
            <span className={`seg-label ${on ? "on" : ""}`}>{label}</span>
          </div>
        );
      })}
      {tip}
    </div>
  );
}
