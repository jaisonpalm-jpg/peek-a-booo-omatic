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

export function TrailerLoadDiagram({ trailer, layout }: Props) {
  if (layout.placements.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic">
        No items to load.
      </p>
    );
  }

  // Distinct item kinds present (for legend)
  const kindsPresent = Array.from(
    new Set(layout.placements.map((p) => p.item.kind)),
  ) as DeckItemKind[];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-[10px] uppercase tracking-widest text-muted-foreground">
        {kindsPresent.map((k) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className="inline-block size-2.5" style={{ backgroundColor: COLORS[k].flat }} />
            {COLORS[k].label}
          </span>
        ))}
        <span className="ml-auto font-mono">
          {trailer.deckLength / 12}&apos; × {(trailer.deckWidth / 12).toFixed(1)}&apos; deck
        </span>
      </div>

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

/* ---------------- 2D top-down ---------------- */

function TopDownView({ trailer, layout }: Props) {
  const PAD = 14;
  const targetW = 420;
  const totalLen = trailer.deckLength + trailer.maxOverhang;
  const scale = (targetW - PAD * 2) / totalLen;
  const deckPxLen = trailer.deckLength * scale;
  const overhangPxLen = trailer.maxOverhang * scale;
  const deckPxWid = Math.max(40, trailer.deckWidth * scale * 4); // exaggerate width for readability
  // actual width-scale for items to match deckPxWid
  const widScale = deckPxWid / trailer.deckWidth;

  const svgW = targetW;
  const svgH = deckPxWid + PAD * 2 + 18;

  return (
    <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-auto bg-secondary/40 border border-border">
      {/* deck */}
      <rect
        x={PAD}
        y={PAD}
        width={deckPxLen}
        height={deckPxWid}
        fill="hsl(var(--background) / 0)"
        className="fill-card"
        stroke="currentColor"
        strokeWidth={1.5}
      />
      {/* overhang zone */}
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

      {/* items */}
      {layout.placements.map((p, i) => {
        const c = COLORS[p.item.kind];
        const x = PAD + p.x * scale;
        const y = PAD + p.y * widScale;
        const w = p.item.lengthIn * scale;
        const h = p.item.widthIn * widScale;
        const showLabel = w > 36 && h > 12;
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
            {showLabel && (
              <text
                x={x + w / 2}
                y={y + h / 2 + 3}
                fontSize={9}
                textAnchor="middle"
                fill="white"
                fontFamily="monospace"
              >
                {p.item.label}
              </text>
            )}
          </g>
        );
      })}

      {/* length scale tick */}
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
        {trailer.maxOverhang > 0 ? ` + ${trailer.maxOverhang / 12}' overhang` : ""}
      </text>
    </svg>
  );
}

/* ---------------- 3D isometric ---------------- */

const ISO_COS = Math.cos((30 * Math.PI) / 180);
const ISO_SIN = Math.sin((30 * Math.PI) / 180);

function project(x: number, y: number, z: number, s: number) {
  // standard 30° isometric — x→right, y→back-right, z→up
  return {
    sx: (x - y) * ISO_COS * s,
    sy: (x + y) * ISO_SIN * s - z * s,
  };
}

function IsoView({ trailer, layout }: Props) {
  const PAD = 20;
  const targetW = 460;

  // base unit scale: fit deck length into available horizontal projection
  const totalLen = trailer.deckLength + trailer.maxOverhang;
  // horizontal extent after iso = (totalLen + deckWidth) * ISO_COS
  const horizExt = (totalLen + trailer.deckWidth) * ISO_COS;
  const s = (targetW - PAD * 2) / horizExt;
  // vertical extent: (totalLen + deckWidth) * ISO_SIN + maxHeight * s
  const vertExt =
    (totalLen + trailer.deckWidth) * ISO_SIN + trailer.maxHeight * s;
  const svgW = targetW;
  const svgH = vertExt + PAD * 2;

  // offset so leftmost iso point is at PAD
  // leftmost x in projection occurs at (x=0, y=deckWidth): sx = -deckWidth*ISO_COS*s
  const offsetX = PAD + trailer.deckWidth * ISO_COS * s;
  // topmost y: at (x=0,y=0,z=maxHeight) sy = -maxHeight*s
  const offsetY = PAD + trailer.maxHeight * s;

  function P(x: number, y: number, z: number) {
    const p = project(x, y, z, s);
    return { x: offsetX + p.sx, y: offsetY + p.sy };
  }

  // Deck floor as a parallelogram
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

  // Sort placements back-to-front, left-to-right, bottom-to-top for painter's algorithm
  // Painter order: smaller x+y first, then lower z first.
  const ordered = [...layout.placements].sort((a, b) => {
    const aDepth = a.x + a.y;
    const bDepth = b.x + b.y;
    return aDepth - bDepth;
  });

  return (
    <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-auto bg-secondary/40 border border-border">
      {/* overhang first (behind) */}
      {overhangPath && (
        <polygon
          points={overhangPath.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="rgba(245, 158, 11, 0.12)"
          stroke="rgba(245, 158, 11, 0.6)"
          strokeDasharray="4 3"
          strokeWidth={1}
        />
      )}
      {/* deck */}
      <polygon
        points={`${f0.x},${f0.y} ${f1.x},${f1.y} ${f2.x},${f2.y} ${f3.x},${f3.y}`}
        className="fill-card"
        stroke="currentColor"
        strokeWidth={1}
      />

      {/* cab block (small box hanging off front) */}
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

      {/* items */}
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
          />
        );
      })}
    </svg>
  );
}

function IsoBox({
  x, y, z, l, w, h, P, top, front, side, stroke = "rgba(0,0,0,0.45)",
}: {
  x: number; y: number; z: number;
  l: number; w: number; h: number;
  P: (x: number, y: number, z: number) => { x: number; y: number };
  top: string; front: string; side: string;
  stroke?: string;
}) {
  // 8 corners
  const A = P(x, y, z);           // back-left-bot
  const B = P(x + l, y, z);       // back-right-bot
  const C = P(x + l, y + w, z);   // front-right-bot
  const D = P(x, y + w, z);       // front-left-bot
  const E = P(x, y, z + h);
  const F = P(x + l, y, z + h);
  const G = P(x + l, y + w, z + h);
  const H = P(x, y + w, z + h);

  const top4 = [E, F, G, H];
  const front4 = [D, C, G, H]; // y+w face (front, toward viewer-right)
  const side4 = [B, C, G, F];  // x+l face (right end of trailer)

  const pts = (arr: { x: number; y: number }[]) =>
    arr.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <g>
      <polygon points={pts(side4)} fill={side} stroke={stroke} strokeWidth={0.5} />
      <polygon points={pts(front4)} fill={front} stroke={stroke} strokeWidth={0.5} />
      <polygon points={pts(top4)} fill={top} stroke={stroke} strokeWidth={0.5} />
    </g>
  );
}
