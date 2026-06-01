import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { Piece, Recommendation } from "./types";
import { effectiveDims } from "./recommend";

interface ExportArgs {
  jobName: string;
  pieces: Piece[];
  rec: Recommendation;
}

function fmt(n: number, digits = 0): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function exportLoadSummaryPdf({ jobName, pieces, rec }: ExportArgs): void {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const marginX = 40;
  let y = 48;

  // Header bar
  doc.setFillColor(24, 24, 27); // zinc-900
  doc.rect(0, 0, pageW, 28, "F");
  doc.setTextColor(255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("LOADFIT  /  LOAD SUMMARY", marginX, 18);
  doc.setFont("helvetica", "normal");
  doc.text(new Date().toLocaleString(), pageW - marginX, 18, { align: "right" });

  // Title
  doc.setTextColor(24, 24, 27);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(jobName || "Untitled Job", marginX, y);
  y += 22;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(
    `${rec.totals.pieces} pieces  ·  ${fmt(rec.totals.cubeFt3)} ft³  ·  ${fmt(rec.totals.linearFt, 1)} linear ft`,
    marginX,
    y,
  );
  y += 26;

  // Recommendation box
  doc.setDrawColor(24, 24, 27);
  doc.setLineWidth(1.5);
  doc.rect(marginX, y, pageW - marginX * 2, 96);

  // Label strip
  doc.setFillColor(24, 24, 27);
  doc.rect(marginX, y, pageW - marginX * 2, 18, "F");
  doc.setTextColor(255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("RECOMMENDED TRAILER", marginX + 10, y + 12);
  const status = rec.withinLegalLimits ? "WITHIN LEGAL LIMITS" : "PERMIT REQUIRED";
  doc.text(status, pageW - marginX - 10, y + 12, { align: "right" });

  // Trailer name
  doc.setTextColor(24, 24, 27);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text(rec.trailer ? rec.trailer.name : "—", marginX + 14, y + 44);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(90);
  if (rec.trailer) {
    doc.text(rec.trailer.description, marginX + 14, y + 60, {
      maxWidth: pageW - marginX * 2 - 28,
    });
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(24, 24, 27);
  doc.text(
    `Utilization: ${Math.round(rec.utilizationPct)}%`,
    marginX + 14,
    y + 84,
  );
  y += 96 + 18;

  // Stats grid
  const stats: Array<[string, string]> = [
    ["Total Volume", `${fmt(rec.totals.cubeFt3)} ft³`],
    ["Pieces", `${fmt(rec.totals.pieces)}`],
    ["Linear Floor", `${fmt(rec.totals.linearFt, 1)} ft`],
    ["Longest", `${fmt(rec.totals.longestIn / 12, 1)} ft`],
    ["Widest", `${fmt(rec.totals.widestIn / 12, 1)} ft`],
    ["Tallest", `${fmt(rec.totals.tallestIn / 12, 1)} ft`],
  ];
  const colW = (pageW - marginX * 2) / 3;
  const rowH = 38;
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
    doc.setFontSize(13);
    doc.setTextColor(24, 24, 27);
    doc.text(value, x + 8, cy + 28);
  });
  y += rowH * 2 + 18;

  // Oversize flags
  if (rec.oversize.length > 0) {
    doc.setFillColor(254, 243, 199); // amber-100
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

  // Piece table
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
    headStyles: {
      fillColor: [24, 24, 27],
      textColor: 255,
      fontStyle: "bold",
      fontSize: 8,
    },
    alternateRowStyles: { fillColor: [248, 248, 250] },
    columnStyles: {
      0: { cellWidth: 24, halign: "center" },
      2: { cellWidth: 90 },
      3: { cellWidth: 60, halign: "center" },
      4: { cellWidth: 36, halign: "center" },
      5: { cellWidth: 60, halign: "right" },
    },
  });

  // Footer
  const pageH = doc.internal.pageSize.getHeight();
  doc.setFontSize(8);
  doc.setTextColor(140);
  doc.setFont("helvetica", "normal");
  doc.text(
    "Federal limits: 8'6\" width · 13'6\" height · 53' length · 4' rear overhang. State permits may vary.",
    marginX,
    pageH - 24,
  );
  doc.text("LoadFit Freight Estimator", pageW - marginX, pageH - 24, {
    align: "right",
  });

  const safeName = (jobName || "load-summary")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  doc.save(`${safeName || "load-summary"}.pdf`);
}
