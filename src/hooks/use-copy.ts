import { useState, useRef, useEffect } from "react";

export function useCopy() {
  const [copied, setCopied] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return [
    copied,
    (value: string, key: string) => {
      navigator.clipboard?.writeText(value).catch(() => {});
      setCopied(key);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(""), 1600);
    },
  ] as const;
}
