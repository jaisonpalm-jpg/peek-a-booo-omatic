import { useState } from "react";
import { ScanLine, Loader2, X } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { scanBuildSheet } from "@/lib/freight/scanSheet.functions";
import type { Piece } from "@/lib/freight/types";

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB (PDFs can be larger than photos)
const MAX_PAGES = 30;

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

function fileToArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsArrayBuffer(file);
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

// Render every page of a PDF to a JPEG data URL.
async function pdfToImages(file: File, maxPages: number): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist");
  // Use the bundled worker via Vite ?url import.
  const workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

  const buf = await fileToArrayBuffer(file);
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  const pageCount = Math.min(pdf.numPages, maxPages);
  const out: string[] = [];
  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2 }); // ~144 DPI
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    const raw = canvas.toDataURL("image/jpeg", 0.85);
    out.push(await downscale(raw));
  }
  return out;
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

    for (const f of files) {
      const isImage = f.type.startsWith("image/");
      const isPdf = f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
      if (!isImage && !isPdf) {
        setError(`"${f.name}" is not an image or PDF.`);
        return;
      }
      if (f.size > MAX_BYTES) {
        setError(`"${f.name}" is over 20 MB — try a smaller file.`);
        return;
      }
    }

    setBusy(true);
    setProgress({ done: 0, total: files.length });
    try {
      const smalls: string[] = [];
      for (const f of files) {
        const isPdf = f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
        if (isPdf) {
          const remaining = MAX_PAGES - smalls.length;
          if (remaining <= 0) break;
          const pages = await pdfToImages(f, remaining);
          smalls.push(...pages);
        } else {
          if (smalls.length >= MAX_PAGES) break;
          const raw = await fileToDataUrl(f);
          smalls.push(await downscale(raw));
        }
        setProgress({ done: smalls.length, total: Math.max(smalls.length, files.length) });
      }

      if (smalls.length === 0) {
        setError("Could not read any pages from the selected files.");
        return;
      }
      if (smalls.length > MAX_PAGES) smalls.length = MAX_PAGES;
      setPreviews(smalls);

      const result = await scan({ data: { images: smalls } });
      setProgress({ done: smalls.length, total: smalls.length });

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
        setError("No pieces detected. Try clearer, more zoomed-in pages.");
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
          accept="image/*,application/pdf,.pdf"
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
              : "Upload images or PDFs — AI fills the piece list"}
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
