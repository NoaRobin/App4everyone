/** Treemap « squarified » (Bruls, Huizing, van Wijk) : rectangles proches du carré, faciles à comparer et à cliquer. */
export type Rect = { x: number; y: number; w: number; h: number };
export type Tile<T> = Rect & { item: T; value: number };

export function squarify<T>(items: T[], value: (t: T) => number, box: Rect): Tile<T>[] {
  const data = items.map((item) => ({ item, value: Math.max(0, value(item)) })).filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total || box.w <= 0 || box.h <= 0) return [];
  const scale = (box.w * box.h) / total;
  const out: Tile<T>[] = [];
  let rect = { ...box };
  let row: { item: T; value: number; area: number }[] = [];
  const worst = (r: typeof row, side: number) => {
    const s = r.reduce((a, d) => a + d.area, 0);
    const max = Math.max(...r.map((d) => d.area)), min = Math.min(...r.map((d) => d.area));
    return Math.max((side * side * max) / (s * s), (s * s) / (side * side * min));
  };
  const layout = (r: typeof row) => {
    const s = r.reduce((a, d) => a + d.area, 0);
    const horizontal = rect.w >= rect.h;
    const thick = s / (horizontal ? rect.h : rect.w);
    let off = 0;
    for (const d of r) {
      const len = d.area / thick;
      out.push(horizontal
        ? { x: rect.x, y: rect.y + off, w: thick, h: len, item: d.item, value: d.value }
        : { x: rect.x + off, y: rect.y, w: len, h: thick, item: d.item, value: d.value });
      off += len;
    }
    rect = horizontal ? { x: rect.x + thick, y: rect.y, w: rect.w - thick, h: rect.h } : { x: rect.x, y: rect.y + thick, w: rect.w, h: rect.h - thick };
  };
  for (const d of data.map((d) => ({ ...d, area: d.value * scale }))) {
    const side = Math.min(rect.w, rect.h);
    if (!row.length || worst([...row, d], side) <= worst(row, side)) row.push(d);
    else { layout(row); row = [d]; }
  }
  if (row.length) layout(row);
  return out;
}
