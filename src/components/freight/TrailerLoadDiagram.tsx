import type { DeckItemKind, DeckLayout, TrailerSpec } from "@/lib/freight/types";

interface Props {
  trailer: TrailerSpec;
  layout: DeckLayout;
}

const COLORS: Record<DeckItemKind, { top: string; front: string; side: string; flat: string; label: string }> = {
  "curb-stack":   { top: "#475569", front: "#334155", side: "#1e293b", flat: "#64748b", label: "Curbs" },
  "pipe-bundle":  { top: "#0ea5e9", front: "#0284c7", side: "#075985", flat: "#38bdf8", label: "Pipe" },
  "box-stack":    { top: "#d97706", front: "#b45309", side: "#78350f", flat: "#f59e0b", label: "Boxes" },
  "gasket-pallet":{ top: "#16a34a", front: "#15803d", side: "#14532d", flat: "#22c55e", label: "Gasket Pallet" },
};

function fmtFt(inches: number): string {
  const ft = inches / 12;
  if (ft >= 1) return `${ft.toFixed(ft >= 10 ? 0 : 1)}'`;
  return `${Math.round(inches)}"`;
}

function fmtLb(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k lb`;
  return `${Math.round(n)} lb`;
}

export function TrailerLoadDiagram({ trailer, layout }: Props) {
  if (layout.placements.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic">
        No items to load.
      </p>
    );
  }

  // Legend: kind → {count, weight}
  const kindStats = new Map<
    DeckItemKind,
    { count: number; units: number; weight: number }
  >();
  for (const p of layout.placements) {
    const cur = kindStats.get(p.item.kind) ?? { count: 0, units: 0, weight: 0 };
    cur.count += 1;
    cur.units += p.item.units;
    cur.weight += p.item.weightLb ?? 0;
    kindStats.set(p.item.kind, cur);
  }

  return (
    <div className="space-y-3">
      <Legend kindStats={kindStats} layout={layout} trailer={trailer} />

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Top-Down (2D)
          </p>
          <TopDownView trailer={trailer} layout={layout} />
        </div>
        <div className="space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Isometric (3D)
          </p>
          <IsoView trailer={trailer} layout={layout} />
        </div>
      </div>
    </div>
  );
}

/* ---------------- Legend ---------------- */

function Legend({
  kindStats,
  layout,
  trailer,
}: {
  kindStats: Map<DeckItemKind, { count: number; units: number; weight: number }>;
  layout: DeckLayout;
  trailer: TrailerSpec;
}) {
  return (
    <div className="border border-rule bg-secondary/30 p-2.5 space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[10px]">
        {[...kindStats.entries()].map(([k, s]) => (
          <span key={k} className="flex items-center gap-1.5 font-mono">
            <span
              className="inline-block size-3 border border-black/30"
              style={{ backgroundColor: COLORS[k].flat }}
            />
            <span className="font-bold uppercase tracking-widest">{COLORS[k].label}</span>
            <span className="text-muted-foreground">
              {s.count} block{s.count === 1 ? "" : "s"}
              {s.units !== s.count ? ` · ${s.units} units` : ""}
              {s.weight > 0 ? ` · ${fmtLb(s.weight)}` : ""}
            </span>
          </span>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] font-mono text-muted-foreground border-t border-border pt-1.5">
        <span>
          Deck <strong className="text-foreground">{trailer.deckLength / 12}&apos;</strong>
          {" × "}<strong className="text-foreground">{(trailer.deckWidth / 12).toFixed(1)}&apos;</strong>
        </span>
        <span>
          Used <strong className="text-foreground">{fmtFt(layout.usedLengthIn)}</strong>
        </span>
        <span>
          Overhang{" "}
          <strong className={layout.totalOverhangIn > 0 ? "text-warning" : "text-foreground"}>
            {fmtFt(layout.totalOverhangIn)}
          </strong>
        </span>
        {layout.weightLb > 0 && (
          <span>
            Total <strong className="text-foreground">{fmtLb(layout.weightLb)}</strong>
          </span>
        )}
        {layout.unplacedCount > 0 && (
          <span className="text-warning font-bold">
            {layout.unplacedCount} unplaced
          </span>
        )}
      </div>
    </div>
  );
}

/* ---------------- 2D top-down ---------------- */

function TopDownView({ trailer, layout }: Props) {
  const PAD = 14;
  const targetW = 420;
  const totalLen = trailer.deckLength + trailer.maxOverhang;
  const scale = (targetW - PAD * 2) / totalLen;
  const deckPxLen = trailer.deckLength * scale;
  const overhangPxLen = trailer.maxOverhang * scale;
  const deckPxWid = Math.max(60, trailer.deckWidth * scale * 4);
  const widScale = deckPxWid / trailer.deckWidth;

  const svgW = targetW;
  const svgH = deckPxWid + PAD * 2 + 18;

  return (
    <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-auto bg-secondary/40 border border-border">
      <rect
        x={PAD}
        y={PAD}
        width={deckPxLen}
        height={deckPxWid}
        className="fill-card"
        stroke="currentColor"
        strokeWidth={1.5}
      />
      {overhangPxLen > 0 && (
        <rect
          x={PAD + deckPxLen}
          y={PAD}
          width={overhangPxLen}
          height={deckPxWid}
          fill="url(#hatch)"
          opacity={0.4}
          stroke="currentColor"
          strokeDasharray="3 3"
          strokeWidth={1}
        />
      )}
      <defs>
        <pattern id="hatch" patternUnits="userSpaceOnUse" width={6} height={6} patternTransform="rotate(45)">
          <line x1={0} y1={0} x2={0} y2={6} stroke="currentColor" strokeWidth={1} opacity={0.5} />
        </pattern>
      </defs>

      {/* cab marker */}
      <rect x={PAD - 8} y={PAD + deckPxWid / 2 - 6} width={6} height={12} className="fill-muted-foreground" />
      <text
        x={PAD - 5}
        y={PAD - 4}
        fontSize={8}
        textAnchor="start"
        className="fill-muted-foreground"
        fontFamily="monospace"
      >
        CAB
      </text>

      {layout.placements.map((p, i) => {
        const c = COLORS[p.item.kind];
        const x = PAD + p.x * scale;
        const y = PAD + p.y * widScale;
        const w = p.item.lengthIn * scale;
        const h = p.item.widthIn * widScale;
        const showPos = w > 18 && h > 10;
        const showDims = w > 64 && h > 22;
        const showWeight = !!p.item.weightLb && w > 80 && h > 32;
        const layers = p.item.units > 1 ? p.item.units : 0;
        const insetMax = Math.min(w, h) * 0.18;
        return (
          <g key={i}>
            <rect
              x={x}
              y={y}
              width={w}
              height={h}
              fill={c.flat}
              stroke={p.item.oversize ? "#f59e0b" : "rgba(0,0,0,0.4)"}
              strokeWidth={p.item.oversize ? 1.5 : 0.75}
            />
            {/* Nested inset rectangles communicate stack depth from top-down. */}
            {layers > 1 &&
              Array.from({ length: Math.min(layers - 1, 3) }).map((_, k) => {
                const inset = ((k + 1) / Math.min(layers, 4)) * insetMax;
                return (
                  <rect
                    key={`ly-${k}`}
                    x={x + inset}
                    y={y + inset}
                    width={Math.max(0, w - inset * 2)}
                    height={Math.max(0, h - inset * 2)}
                    fill="none"
                    stroke="rgba(255,255,255,0.55)"
                    strokeWidth={0.6}
                    strokeDasharray="2 2"
                  />
                );
              })}
            {showPos && (
              <text
                x={x + 3}
                y={y + 10}
                fontSize={8}
                textAnchor="start"
                fill="white"
                fontFamily="monospace"
                fontWeight={700}
              >
                {p.posLabel}
                {layers > 1 ? ` ×${layers}` : ""}
              </text>
            )}
            {showDims && (
              <text
                x={x + w / 2}
                y={y + h / 2 + 2}
                fontSize={8}
                textAnchor="middle"
                fill="white"
                fontFamily="monospace"
              >
                {fmtFt(p.item.lengthIn)}×{fmtFt(p.item.widthIn)}
              </text>
            )}
            {showWeight && (
              <text
                x={x + w / 2}
                y={y + h / 2 + 12}
                fontSize={7}
                textAnchor="middle"
                fill="rgba(255,255,255,0.85)"
                fontFamily="monospace"
              >
                {fmtLb(p.item.weightLb!)}
              </text>
            )}
          </g>
        );
      })}

      <line
        x1={PAD}
        y1={svgH - 12}
        x2={PAD + deckPxLen}
        y2={svgH - 12}
        stroke="currentColor"
        strokeWidth={0.5}
      />
      <text
        x={PAD + deckPxLen / 2}
        y={svgH - 2}
        fontSize={9}
        textAnchor="middle"
        className="fill-muted-foreground"
        fontFamily="monospace"
      >
        {trailer.deckLength / 12}&apos; deck
        {trailer.maxOverhang > 0 ? ` + ${trailer.maxOverhang / 12}' overhang zone` : ""}
      </text>
    </svg>
  );
}

/* ---------------- 3D isometric ---------------- */

const ISO_COS = Math.cos((30 * Math.PI) / 180);
const ISO_SIN = Math.sin((30 * Math.PI) / 180);

function project(x: number, y: number, z: number, s: number) {
  return {
    sx: (x - y) * ISO_COS * s,
    sy: (x + y) * ISO_SIN * s - z * s,
  };
}

function IsoView({ trailer, layout }: Props) {
  const PAD = 20;
  const targetW = 460;

  const totalLen = trailer.deckLength + trailer.maxOverhang;
  const horizExt = (totalLen + trailer.deckWidth) * ISO_COS;
  const s = (targetW - PAD * 2) / horizExt;
  const vertExt =
    (totalLen + trailer.deckWidth) * ISO_SIN + trailer.maxHeight * s;
  const svgW = targetW;
  const svgH = vertExt + PAD * 2;

  const offsetX = PAD + trailer.deckWidth * ISO_COS * s;
  const offsetY = PAD + trailer.maxHeight * s;

  function P(x: number, y: number, z: number) {
    const p = project(x, y, z, s);
    return { x: offsetX + p.sx, y: offsetY + p.sy };
  }

  const f0 = P(0, 0, 0);
  const f1 = P(trailer.deckLength, 0, 0);
  const f2 = P(trailer.deckLength, trailer.deckWidth, 0);
  const f3 = P(0, trailer.deckWidth, 0);
  const overhangPath = trailer.maxOverhang > 0
    ? [
        P(trailer.deckLength, 0, 0),
        P(trailer.deckLength + trailer.maxOverhang, 0, 0),
        P(trailer.deckLength + trailer.maxOverhang, trailer.deckWidth, 0),
        P(trailer.deckLength, trailer.deckWidth, 0),
      ]
    : null;

  const ordered = [...layout.placements].sort((a, b) => {
    return (a.x + a.y) - (b.x + b.y);
  });

  return (
    <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-auto bg-secondary/40 border border-border">
      {overhangPath && (
        <polygon
          points={overhangPath.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="rgba(245, 158, 11, 0.12)"
          stroke="rgba(245, 158, 11, 0.6)"
          strokeDasharray="4 3"
          strokeWidth={1}
        />
      )}
      <polygon
        points={`${f0.x},${f0.y} ${f1.x},${f1.y} ${f2.x},${f2.y} ${f3.x},${f3.y}`}
        className="fill-card"
        stroke="currentColor"
        strokeWidth={1}
      />

      <IsoBox
        x={-30}
        y={trailer.deckWidth * 0.15}
        z={0}
        l={28}
        w={trailer.deckWidth * 0.7}
        h={70}
        P={P}
        top="#94a3b8"
        front="#64748b"
        side="#475569"
      />

      {ordered.map((p, i) => {
        const c = COLORS[p.item.kind];
        return (
          <IsoBox
            key={i}
            x={p.x}
            y={p.y}
            z={0}
            l={p.item.lengthIn}
            w={p.item.widthIn}
            h={p.item.heightIn}
            P={P}
            top={c.top}
            front={c.front}
            side={c.side}
            stroke={p.item.oversize ? "#f59e0b" : "rgba(0,0,0,0.5)"}
            label={p.posLabel}
            layers={p.item.units > 1 ? p.item.units : 0}
          />
        );
      })}
    </svg>
  );
}

function IsoBox({
  x, y, z, l, w, h, P, top, front, side, stroke = "rgba(0,0,0,0.45)", label, layers = 0,
}: {
  x: number; y: number; z: number;
  l: number; w: number; h: number;
  P: (x: number, y: number, z: number) => { x: number; y: number };
  top: string; front: string; side: string;
  stroke?: string;
  label?: string;
  /** When > 1, draw that many horizontal dividers on the front + side faces. */
  layers?: number;
}) {
  const A = P(x, y, z);
  const B = P(x + l, y, z);
  const C = P(x + l, y + w, z);
  const D = P(x, y + w, z);
  const E = P(x, y, z + h);
  const F = P(x + l, y, z + h);
  const G = P(x + l, y + w, z + h);
  const H = P(x, y + w, z + h);

  const top4 = [E, F, G, H];
  const front4 = [D, C, G, H];
  const side4 = [B, C, G, F];

  const pts = (arr: { x: number; y: number }[]) =>
    arr.map((p) => `${p.x},${p.y}`).join(" ");

  // label centered on top face
  const cx = (E.x + G.x) / 2;
  const cy = (E.y + G.y) / 2;

  // Layer dividers: interpolate between bottom + top edges of each visible face.
  const dividers: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  if (layers > 1) {
    const lerp = (a: { x: number; y: number }, b: { x: number; y: number }, t: number) => ({
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
    });
    for (let k = 1; k < layers; k++) {
      const t = k / layers;
      // front face: D→H (left edge), C→G (right edge)
      const p1 = lerp(D, H, t);
      const p2 = lerp(C, G, t);
      dividers.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
      // side face: B→F (front edge), C→G (back edge — shared with front face)
      const p3 = lerp(B, F, t);
      const p4 = lerp(C, G, t);
      dividers.push({ x1: p3.x, y1: p3.y, x2: p4.x, y2: p4.y });
    }
  }

  return (
    <g>
      <polygon points={pts(side4)} fill={side} stroke={stroke} strokeWidth={0.5} />
      <polygon points={pts(front4)} fill={front} stroke={stroke} strokeWidth={0.5} />
      <polygon points={pts(top4)} fill={top} stroke={stroke} strokeWidth={0.5} />
      {dividers.map((d, di) => (
        <line
          key={di}
          x1={d.x1}
          y1={d.y1}
          x2={d.x2}
          y2={d.y2}
          stroke="rgba(255,255,255,0.55)"
          strokeWidth={0.6}
          strokeDasharray="2 2"
        />
      ))}
      {label && (
        <text
          x={cx}
          y={cy + 3}
          fontSize={8}
          textAnchor="middle"
          fill="white"
          fontFamily="monospace"
          fontWeight={700}
        >
          {label}
          {layers > 1 ? ` ×${layers}` : ""}
        </text>
      )}
    </g>
  );
}
