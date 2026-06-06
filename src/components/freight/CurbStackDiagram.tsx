import type { CurbStackView } from "@/lib/freight/types";

interface CurbStackDiagramProps {
  stacks: CurbStackView[];
  /** Trailer max load height in inches — used to scale the column. */
  maxHeightIn: number;
}

const COLUMN_PX = 140;
const MAX_WIDTH_IN_REFERENCE = 240; // widest curb we expect ≈ 20'

/**
 * Side-view of each curb stack. Width of each block ∝ piece length,
 * height of each block ∝ piece height, with a 2" dunnage gap shown
 * between layers and a dashed strap/separation perimeter around the base.
 */
export function CurbStackDiagram({ stacks, maxHeightIn }: CurbStackDiagramProps) {
  if (stacks.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Curb Stack Layout
        </p>
        <div className="flex items-center gap-3 text-[9px] uppercase tracking-widest text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block size-2 bg-rule" /> Curb
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-px border-t border-dashed border-warning" /> 4&quot; buffer
          </span>
        </div>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2">
        {stacks.map((stack, idx) => (
          <StackColumn
            key={idx}
            stack={stack}
            index={idx}
            maxHeightIn={maxHeightIn}
          />
        ))}
      </div>
    </div>
  );
}

function StackColumn({
  stack,
  index,
  maxHeightIn,
}: {
  stack: CurbStackView;
  index: number;
  maxHeightIn: number;
}) {
  // Reverse so the bottom-most (largest) layer renders at the bottom of the column.
  const renderLayers = [...stack.layers].reverse();
  const widest = Math.max(...stack.layers.map((l) => l.length), 1);
  const scale = Math.min(1, MAX_WIDTH_IN_REFERENCE / widest);
  const pxPerInchHeight = COLUMN_PX / Math.max(maxHeightIn, 1);

  return (
    <div className="shrink-0 flex flex-col items-center gap-2 w-[160px]">
      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        Position {index + 1}
      </div>

      {/* Dashed buffer perimeter wraps the visual stack */}
      <div className="relative">
        <div
          className="absolute inset-0 border border-dashed border-warning/70 pointer-events-none"
          style={{ margin: "-6px" }}
          aria-hidden
        />
        <div
          className="flex flex-col items-center justify-end bg-secondary/40"
          style={{ height: `${COLUMN_PX}px`, width: "140px" }}
        >
          {renderLayers.map((layer, i) => {
            const wPx = Math.max(20, layer.length * scale * (140 / MAX_WIDTH_IN_REFERENCE) * 4);
            const hPx = Math.max(8, layer.height * pxPerInchHeight);
            const isBottom = i === renderLayers.length - 1;
            return (
              <div key={i} className="flex flex-col items-center w-full">
                <div
                  className={`relative flex items-center justify-center text-[9px] font-mono text-background ${
                    layer.oversize ? "bg-warning" : "bg-rule"
                  }`}
                  style={{ width: `${Math.min(wPx, 140)}px`, height: `${hPx}px` }}
                  title={`${layer.description} — ${layer.length}" × ${layer.width}" × ${layer.height}"`}
                >
                  {hPx >= 14 && (
                    <span className="truncate px-1">
                      {layer.length}×{layer.width}×{layer.height}
                    </span>
                  )}
                </div>
                {/* dunnage gap shown between layers */}
                {!isBottom && (
                  <div className="w-full h-[2px] bg-transparent border-t border-dotted border-border" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="text-center text-[10px] leading-tight text-muted-foreground">
        <div className="font-mono font-bold text-foreground">
          {stack.layers.length} pc · {stack.heightIn.toFixed(0)}&quot; tall
        </div>
        <div>{(stack.footprintIn2 / 144).toFixed(1)} ft² base</div>
      </div>
    </div>
  );
}
