import { useState } from "react";
import { ScanLine, Loader2, X } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { scanBuildSheet } from "@/lib/freight/scanSheet.functions";
import type { Piece } from "@/lib/freight/types";

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

// Downscale large photos in the browser so we don't ship 12MP images to the model.
async function downscale(dataUrl: string, maxEdge = 1600): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("Bad image"));
    i.src = dataUrl;
  });
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
  if (scale === 1) return dataUrl;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

interface Props {
  onPieces: (pieces: Piece[]) => void;
}

export function ScanSheetButton({ onPieces }: Props) {
  const scan = useServerFn(scanBuildSheet);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  async function handleFiles(fileList: FileList) {
    setError(null);
    const files = Array.from(fileList);
    if (files.length === 0) return;
    if (files.length > 30) {
      setError("Up to 30 pages at a time, please.");
      return;
    }
    for (const f of files) {
      if (!f.type.startsWith("image/")) {
        setError("Please choose image files (JPG or PNG).");
        return;
      }
      if (f.size > MAX_BYTES) {
        setError(`"${f.name}" is over 8 MB — try a smaller photo.`);
        return;
      }
    }

    setBusy(true);
    setProgress({ done: 0, total: files.length });
    try {
      const smalls: string[] = [];
      for (const f of files) {
        const raw = await fileToDataUrl(f);
        const small = await downscale(raw);
        smalls.push(small);
      }
      setPreviews(smalls);

      const result = await scan({ data: { images: smalls } });
      setProgress({ done: files.length, total: files.length });

      const pieces: Piece[] = result.pieces.map((p, idx) => ({
        id: `scan-${Date.now()}-${idx}`,
        description: p.description,
        length: p.length,
        width: p.width,
        height: p.height,
        qty: p.qty,
        orientation: "as-entered",
      }));
      if (pieces.length === 0) {
        setError("No pieces detected. Try clearer, more zoomed-in photos.");
      } else {
        onPieces(pieces);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <div className="space-y-2">
      <label
        className={`w-full p-5 bg-card ring-2 ring-border flex items-center gap-4 border-2 border-dashed border-border text-left hover:border-rule hover:bg-secondary transition-colors ${
          busy ? "cursor-wait opacity-70" : "cursor-pointer"
        }`}
      >
        <input
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          disabled={busy}
          className="sr-only"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <div className="size-12 bg-secondary flex items-center justify-center shrink-0">
          {busy ? (
            <Loader2 className="size-5 text-foreground animate-spin" />
          ) : (
            <ScanLine className="size-5 text-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold uppercase tracking-tight">
            {busy
              ? progress
                ? `Reading ${progress.total} page${progress.total > 1 ? "s" : ""}…`
                : "Reading build sheet…"
              : "Scan Build Sheet"}
          </h3>
          <p className="text-xs text-muted-foreground truncate">
            {busy
              ? "Extracting pieces with AI vision"
              : "Snap or upload one or more pages — AI fills the piece list"}
          </p>
        </div>
        <span className="px-2.5 py-1 bg-rule text-background text-[10px] font-bold uppercase tracking-widest">
          {busy ? "…" : "Scan"}
        </span>
      </label>

      {previews.length > 0 && !busy && (
        <div className="flex flex-wrap gap-2">
          {previews.map((src, i) => (
            <div key={i} className="relative inline-block">
              <img
                src={src}
                alt={`Scanned build sheet page ${i + 1}`}
                className="max-h-32 ring-1 ring-border"
              />
              <button
                type="button"
                onClick={() => setPreviews((p) => p.filter((_, idx) => idx !== i))}
                className="absolute -top-2 -right-2 bg-rule text-background p-0.5"
                aria-label={`Dismiss preview ${i + 1}`}
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="text-xs font-semibold text-destructive bg-destructive/10 border border-destructive/30 px-3 py-2"
        >
          {error}
        </p>
      )}
    </div>
  );
}
