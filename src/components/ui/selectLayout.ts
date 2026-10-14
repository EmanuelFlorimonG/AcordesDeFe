const PANEL_GAP = 6;

/** Keep the floating list inside the usable viewport, opening upward when needed. */
export function placeSelectPanel(
  rect: Pick<DOMRect, 'top' | 'bottom' | 'right' | 'width'>,
  viewport: { width: number; bottom: number },
  panelMinWidth: number,
  desiredHeight: number,
) {
  const width = Math.min(Math.max(rect.width, panelMinWidth), Math.max(0, viewport.width - 16));
  const left = Math.min(Math.max(8, rect.right - width), viewport.width - width - 8);
  const below = Math.max(0, viewport.bottom - rect.bottom - PANEL_GAP - 8);
  const above = Math.max(0, rect.top - PANEL_GAP - 8);
  const upward = below < desiredHeight && above > below;
  const maxHeight = Math.min(desiredHeight, upward ? above : below);
  return { top: upward ? rect.top - PANEL_GAP - maxHeight : rect.bottom + PANEL_GAP, left, width, maxHeight };
}

/** Match the next option when typing, wrapping around the list. */
export function findSelectMatch(labels: readonly string[], query: string, start: number): number {
  for (let offset = 0; offset < labels.length; offset++) {
    const index = (start + offset) % labels.length;
    if (labels[index].toLocaleLowerCase().startsWith(query.toLocaleLowerCase())) return index;
  }
  return -1;
}
