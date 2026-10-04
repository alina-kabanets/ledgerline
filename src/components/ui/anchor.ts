type Options = {
  align?: "left" | "right";
  // Tallest the panel may get. It shrinks further if the screen has less room.
  maxHeight?: number;
  // Make the panel at least as wide as the field it belongs to.
  matchWidth?: boolean;
};

const GAP = 4;
const EDGE = 8;
// About five options. With less room than this below the field, the panel opens upwards.
const MIN_ROOM = 200;

// Places a dropdown panel directly under its field, on top of everything, and keeps it
// on screen: it opens upwards when there is no room below, never runs past the edge of
// the window, and scrolls inside itself when the list is long. Positioned against the
// window (not the scrolling pane it sits in), so a pane's edge can never cut it off.
// Returns a function that stops following the field.
export function anchorPanel(anchor: HTMLElement, panel: HTMLElement, { align = "left", maxHeight = 320, matchWidth = false }: Options = {}) {
  const place = () => {
    const rect = anchor.getBoundingClientRect();
    const style = panel.style;

    // Measure at natural size first. Lifting the height limit resets the list's own
    // scroll position, so remember it and put it back.
    const scrolled = panel.scrollTop;
    style.maxHeight = "";
    style.minWidth = matchWidth ? `${rect.width}px` : "";
    style.maxWidth = `${window.innerWidth - EDGE * 2}px`;

    const below = window.innerHeight - rect.bottom - GAP - EDGE;
    const above = rect.top - GAP - EDGE;
    // Down unless the room below is too small to be useful. The test depends only on
    // where the field is, never on how long its list is, so two fields side by side
    // always open the same way. A long list shrinks and scrolls rather than flipping.
    const up = below < MIN_ROOM && above > below;
    const room = Math.max(120, up ? above : below);

    style.maxHeight = `${Math.min(maxHeight, room)}px`;
    style.top = up ? "" : `${rect.bottom + GAP}px`;
    style.bottom = up ? `${window.innerHeight - rect.top + GAP}px` : "";

    const width = panel.offsetWidth;
    const left = align === "right" ? rect.right - width : rect.left;
    style.left = `${Math.max(EDGE, Math.min(left, window.innerWidth - width - EDGE))}px`;
    style.visibility = "visible";
    panel.scrollTop = scrolled;
  };

  // Scrolling inside the list is not a reason to move it. Re-placing on those events
  // was undoing the scroll.
  const onScroll = (e: Event) => {
    if (e.target instanceof Node && panel.contains(e.target)) return;
    place();
  };

  place();
  // Follow the field if the page or a pane scrolls, or the window changes size.
  window.addEventListener("scroll", onScroll, true);
  window.addEventListener("resize", place);
  return () => {
    window.removeEventListener("scroll", onScroll, true);
    window.removeEventListener("resize", place);
  };
}

// Shared by every panel placed with anchorPanel. Hidden until it has been positioned.
export const anchoredPanel = "fixed z-50 invisible";
