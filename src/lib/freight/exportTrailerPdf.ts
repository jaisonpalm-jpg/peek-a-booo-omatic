import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type {
  CandidateBreakdown,
  Piece,
  Recommendation,
} from "./types";
import { effectiveDims } from "./recommend";

interface ExportArgs {
  jobName: string;
  pieces: Piece[];
  rec: Recommendation;
  candidate: CandidateBreakdown;
  scenarioName: string;
  /** DOM container that holds the 2D/3D SVGs (data-export-svg="topdown"|"iso"). */
  diagramContainerId: string;
}

function fmt(n: number, digits = 0): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Serialize an SVG with inlined computed styles, then rasterize to PNG dataURL. */
async function svgToPngDataUrl(
  svg: SVGSVGElement,
  scale = 2,
): Promise<{ dataUrl: string; width: number; height: number }> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const srcEls = svg.querySelectorAll<SVGElement>("*");
  const dstEls = clone.querySelectorAll<SVGElement>("*");
  const props = [
    "fill",
    "stroke",
    "stroke-width",
    "stroke-dasharray",
    "opacity",
    "fill-opacity",
    "stroke-opacity",
    "font-family",
    "font-size",
    "font-weight",
    "color",
  ];
  // Inline the root color too (for currentColor)
  const rootCs = window.getComputedStyle(svg);
  clone.style.color = rootCs.color;
  srcEls.forEach((src, i) => {
    const dst = dstEls[i] as SVGElement | undefined;
    if (!dst) return;
    const cs = window.getComputedStyle(src);
    let style = "";
    for (const p of props) {
      const v = cs.getPropertyValue(p);
      if (v) style += `${p}:${v};`;
    }
    dst.setAttribute("style", style);
  });

  const vb = svg.viewBox.baseVal;
  const w = (vb && vb.width) || svg.clientWidth || 400;
  const h = (vb && vb.height) || svg.clientHeight || 300;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(w));
  clone.setAttribute("height", String(h));

  const xml = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = (e) => reject(e);
      i.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { dataUrl: canvas.toDataURL("image/png"), width: w, height: h };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function exportTrailerPdf({
  jobName,
  pieces,
  rec,
  candidate,
  scenarioName,
  diagramContainerId,
}: ExportArgs): Promise<void> {
  const container = document.getElementById(diagramContainerId);
  const topSvg = container?.querySelector<SVGSVGElement>(
    'svg[data-export-svg="topdown"]',
  );
  const isoSvg = container?.querySelector<SVGSVGElement>(
    'svg[data-export-svg="iso"]',
  );

  const [topImg, isoImg] = await Promise.all([
    topSvg ? svgToPngDataUrl(topSvg, 2) : Promise.resolve(null),
    isoSvg ? svgToPngDataUrl(isoSvg, 2) : Promise.resolve(null),
  ]);

  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 40;
  let y = 48;

  // Header bar
  doc.setFillColor(24, 24, 27);
  doc.rect(0, 0, pageW, 28, "F");
  doc.setTextColor(255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("LOADFIT  /  TRAILER REPORT", marginX, 18);
  doc.setFont("helvetica", "normal");
  doc.text(new Date().toLocaleString(), pageW - marginX, 18, { align: "right" });

  // Job title
  doc.setTextColor(24, 24, 27);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(jobName || "Untitled Job", marginX, y);
  y += 18;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(
    `${rec.totals.pieces} pieces  ·  ${fmt(rec.totals.cubeFt3)} ft³  ·  ${fmt(rec.totals.linearFt, 1)} linear ft`,
    marginX,
    y,
  );
  y += 16;

  // Trailer box
  doc.setDrawColor(24, 24, 27);
  doc.setLineWidth(1.5);
  doc.rect(marginX, y, pageW - marginX * 2, 92);
  doc.setFillColor(24, 24, 27);
  doc.rect(marginX, y, pageW - marginX * 2, 18, "F");
  doc.setTextColor(255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("SELECTED TRAILER", marginX + 10, y + 12);
  doc.text(
    `SCENARIO: ${scenarioName.toUpperCase()}`,
    pageW - marginX - 10,
    y + 12,
    { align: "right" },
  );

  doc.setTextColor(24, 24, 27);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(candidate.trailer.name, marginX + 14, y + 42);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text(candidate.trailer.description, marginX + 14, y + 58, {
    maxWidth: pageW - marginX * 2 - 28,
  });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(24, 24, 27);
  doc.text(
    `Utilization: ${Math.round(candidate.utilizationPct)}%  ·  Deck area: ${Math.round(candidate.deckAreaPct)}%  ·  Fits: ${candidate.fits ? "YES" : "NO"}`,
    marginX + 14,
    y + 82,
  );
  y += 92 + 14;

  // Confidence section
  {
    const conf = Math.round(rec.confidence);
    const barX = marginX;
    const barW = pageW - marginX * 2;
    const headerH = 18;
    // Header
    doc.setFillColor(24, 24, 27);
    doc.rect(barX, y, barW, headerH, "F");
    doc.setTextColor(255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("CONFIDENCE", barX + 10, y + 12);
    doc.text(`${conf}%`, barX + barW - 10, y + 12, { align: "right" });
    y += headerH;
    // Body box
    const reasonLines = doc.splitTextToSize(
      rec.reason || "—",
      barW - 20,
    ) as string[];
    // Build factor breakdown (mirrors recommend.ts confidence math)
    const best = candidate;
    const factors: Array<[string, string]> = [];
    factors.push(["Base score", "100"]);
    if (rec.totals.pieces === 0) {
      factors.push(["No pieces entered", "→ 0"]);
    } else if (!rec.trailer) {
      factors.push(["No standard trailer fits load", "→ 25"]);
    } else {
      if (rec.oversize.length > 0) {
        const pen = Math.min(30, rec.oversize.length * 10);
        factors.push([
          `${rec.oversize.length} oversize flag${rec.oversize.length === 1 ? "" : "s"} (permits required)`,
          `−${pen}`,
        ]);
      }
      if (best.utilizationPct > 95) {
        factors.push([
          `Deck length ${Math.round(best.utilizationPct)}% utilized (tight fit)`,
          "−10",
        ]);
      }
      if (best.deckAreaPct > 95) {
        factors.push([
          `Floor area ${Math.round(best.deckAreaPct)}% occupied`,
          "−10",
        ]);
      }
    }
    factors.push(["Final confidence", `${conf}%`]);

    const bodyPadding = 10;
    const reasonBlockH = reasonLines.length * 11 + 4;
    const barRowH = 14;
    const factorsH = factors.length * 12 + 6;
    const bodyH = bodyPadding * 2 + reasonBlockH + barRowH + factorsH;
    doc.setDrawColor(220);
    doc.setLineWidth(0.5);
    doc.rect(barX, y, barW, bodyH);
    // Confidence bar
    let by = y + bodyPadding;
    const trackW = barW - bodyPadding * 2;
    doc.setFillColor(235);
    doc.rect(barX + bodyPadding, by, trackW, 6, "F");
    if (conf >= 80) doc.setFillColor(22, 163, 74);
    else if (conf >= 60) doc.setFillColor(37, 99, 235);
    else doc.setFillColor(217, 119, 6);
    doc.rect(barX + bodyPadding, by, (trackW * conf) / 100, 6, "F");
    by += barRowH;
    // Reason
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(60);
    doc.text(reasonLines, barX + bodyPadding, by + 8);
    by += reasonBlockH;
    // Factor breakdown
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(120);
    doc.text("HOW THIS IS CALCULATED", barX + bodyPadding, by + 2);
    by += 8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(40);
    factors.forEach(([label, val], i) => {
      const ly = by + i * 12 + 8;
      doc.text(label, barX + bodyPadding, ly);
      doc.setFont("helvetica", "bold");
      doc.text(val, barX + barW - bodyPadding, ly, { align: "right" });
      doc.setFont("helvetica", "normal");
    });
    y += bodyH + 14;
  }

  // Trailer specs grid
  const t = candidate.trailer;
  const layout = candidate.scenarios.find((s) => s.name === scenarioName)?.layout ?? candidate.layout;
  const stats: Array<[string, string]> = [
    ["Deck Length", `${fmt(t.deckLength / 12, 0)} ft`],
    ["Deck Width", `${fmt(t.deckWidth / 12, 1)} ft`],
    ["Max Height", `${fmt(t.maxHeight / 12, 1)} ft`],
    ["Max Overhang", `${fmt(t.maxOverhang / 12, 1)} ft`],
    ["Items Placed", `${layout.placedCount}${layout.unplacedCount > 0 ? ` (+${layout.unplacedCount} unplaced)` : ""}`],
    ["Used Length", `${fmt(layout.usedLengthIn / 12, 1)} ft`],
    ["Overhang", `${fmt(layout.totalOverhangIn / 12, 1)} ft`],
    ["Total Weight", layout.weightLb > 0 ? `${fmt(layout.weightLb)} lb` : "—"],
    ["Enclosed", t.enclosed ? "Yes" : "No"],
  ];
  const colW = (pageW - marginX * 2) / 3;
  const rowH = 34;
  stats.forEach(([label, value], i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = marginX + col * colW;
    const cy = y + row * rowH;
    doc.setDrawColor(220);
    doc.setLineWidth(0.5);
    doc.rect(x, cy, colW, rowH);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(120);
    doc.text(label.toUpperCase(), x + 8, cy + 12);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(24, 24, 27);
    doc.text(value, x + 8, cy + 26);
  });
  y += rowH * Math.ceil(stats.length / 3) + 16;

  // 2D diagram
  if (topImg) {
    if (y > pageH - 220) {
      doc.addPage();
      y = 48;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(24, 24, 27);
    doc.text("TOP-DOWN (2D)", marginX, y);
    y += 8;
    const imgW = pageW - marginX * 2;
    const imgH = (topImg.height / topImg.width) * imgW;
    doc.addImage(topImg.dataUrl, "PNG", marginX, y, imgW, imgH);
    y += imgH + 14;
  }

  // 3D diagram
  if (isoImg) {
    if (y > pageH - 240) {
      doc.addPage();
      y = 48;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(24, 24, 27);
    doc.text("ISOMETRIC (3D)", marginX, y);
    y += 8;
    const imgW = pageW - marginX * 2;
    const imgH = (isoImg.height / isoImg.width) * imgW;
    doc.addImage(isoImg.dataUrl, "PNG", marginX, y, imgW, imgH);
    y += imgH + 14;
  }

  // Oversize flags
  if (rec.oversize.length > 0) {
    if (y > pageH - 80) {
      doc.addPage();
      y = 48;
    }
    doc.setFillColor(254, 243, 199);
    doc.setDrawColor(217, 119, 6);
    doc.setLineWidth(1);
    const boxH = 22 + rec.oversize.length * 14;
    doc.rect(marginX, y, pageW - marginX * 2, boxH, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(146, 64, 14);
    doc.text(
      `${rec.oversize.length} OVERSIZE FLAG${rec.oversize.length === 1 ? "" : "S"}`,
      marginX + 10,
      y + 15,
    );
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(60, 30, 0);
    rec.oversize.forEach((o, i) => {
      doc.text(`•  ${o.detail}`, marginX + 14, y + 30 + i * 14);
    });
    y += boxH + 14;
  }

  // Placement table
  if (layout.placements.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [["Pos", "Item", "L×W×H (in)", "Units", "Weight"]],
      body: layout.placements.map((p) => [
        p.posLabel ?? "—",
        p.item.label,
        `${Math.round(p.item.lengthIn)} × ${Math.round(p.item.widthIn)} × ${Math.round(p.item.heightIn)}`,
        String(p.item.units),
        p.item.weightLb ? `${fmt(p.item.weightLb)} lb` : "—",
      ]),
      margin: { left: marginX, right: marginX },
      styles: { font: "helvetica", fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [24, 24, 27], textColor: 255, fontStyle: "bold", fontSize: 8 },
      alternateRowStyles: { fillColor: [248, 248, 250] },
      columnStyles: {
        0: { cellWidth: 40, halign: "center" },
        2: { cellWidth: 100 },
        3: { cellWidth: 44, halign: "center" },
        4: { cellWidth: 60, halign: "right" },
      },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;
  }

  // Pieces table (full job manifest)
  doc.addPage();
  y = 48;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(24, 24, 27);
  doc.text("Job Manifest", marginX, y);
  y += 16;
  autoTable(doc, {
    startY: y,
    head: [["#", "Description", "L×W×H (in)", "Orient", "Qty", "Cube ft³"]],
    body: pieces
      .filter((p) => p.qty > 0 && p.length > 0)
      .map((p, i) => {
        const d = effectiveDims(p);
        const cube = (d.length * d.width * d.height * p.qty) / 1728;
        const orient =
          p.orientation === "as-entered"
            ? "AS"
            : p.orientation === "on-side"
              ? "ON-SIDE"
              : "UPRIGHT";
        return [
          String(i + 1),
          p.description || "—",
          `${d.length} × ${d.width} × ${d.height}`,
          orient,
          String(p.qty),
          fmt(cube, 1),
        ];
      }),
    margin: { left: marginX, right: marginX },
    styles: { font: "helvetica", fontSize: 9, cellPadding: 6 },
    headStyles: { fillColor: [24, 24, 27], textColor: 255, fontStyle: "bold", fontSize: 8 },
    alternateRowStyles: { fillColor: [248, 248, 250] },
    columnStyles: {
      0: { cellWidth: 24, halign: "center" },
      2: { cellWidth: 90 },
      3: { cellWidth: 60, halign: "center" },
      4: { cellWidth: 36, halign: "center" },
      5: { cellWidth: 60, halign: "right" },
    },
  });

  // Footer on every page
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.setFont("helvetica", "normal");
    doc.text(
      "Federal limits: 8'6\" width · 13'6\" height · 53' length · 4' rear overhang. State permits may vary.",
      marginX,
      pageH - 24,
    );
    doc.text(`Page ${i} / ${pageCount}`, pageW - marginX, pageH - 24, {
      align: "right",
    });
  }

  const safeJob = (jobName || "trailer-report")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const safeTrailer = candidate.trailer.shortName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  doc.save(`${safeJob || "trailer-report"}-${safeTrailer}.pdf`);
}
