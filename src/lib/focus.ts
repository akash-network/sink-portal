export function isPhone() {
  try {
    return matchMedia("(max-width: 640px)").matches;
  } catch {
    return false;
  }
}

// Scroll and focus after React commits, skipping elements hidden at this width.
export function show(
  scrollId: string | null,
  focusId: string | null,
  block: ScrollLogicalPosition = "start",
) {
  setTimeout(() => {
    const visible = (id: string | null) => {
      if (!id) return null;
      const node = document.getElementById(id);
      return node && node.getClientRects().length ? node : null;
    };
    visible(scrollId)?.scrollIntoView({
      behavior: "smooth",
      block,
    });
    visible(focusId)?.focus({ preventScroll: true });
  }, 60);
}
