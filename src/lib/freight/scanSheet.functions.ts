import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Input: a data URL (image/jpeg or image/png) of the build sheet photo.
const InputSchema = z.object({
  imageDataUrl: z
    .string()
    .min(32)
    .max(15_000_000)
    .refine((s) => s.startsWith("data:image/"), "Must be an image data URL"),
});

const PieceSchema = z.object({
  description: z.string().min(1).max(200),
  length: z.number().nonnegative().max(1200),
  width: z.number().nonnegative().max(1200),
  height: z.number().nonnegative().max(1200),
  qty: z.number().int().positive().max(9999),
});

const ResultSchema = z.object({
  pieces: z.array(PieceSchema).max(200),
  notes: z.string().max(500).optional().default(""),
});

const SYSTEM_PROMPT = `You are a freight build-sheet parser. The user uploads a photo of a handwritten or printed build sheet listing freight pieces (ductwork, pipe, fittings, equipment, etc.).

Extract every line item as a piece with:
- description: short human label (include size/diameter if shown, e.g. '24" Spiral Pipe')
- length, width, height: all in INCHES (convert feet→inches: 1 ft = 12 in; if a piece is round, set width = height = diameter; if a dimension is missing, infer from context — for round pipe of diameter D and length L, use length=L, width=D, height=D)
- qty: integer count

Return ONLY via the extract_pieces tool. Do not fabricate pieces. Skip header rows, totals, and notes.`;

export const scanBuildSheet = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      throw new Error("LOVABLE_API_KEY is not configured on the server.");
    }

    const tool = {
      type: "function" as const,
      function: {
        name: "extract_pieces",
        description: "Return the freight pieces extracted from the build sheet image.",
        parameters: {
          type: "object",
          properties: {
            pieces: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  description: { type: "string" },
                  length: { type: "number", description: "Length in inches" },
                  width: { type: "number", description: "Width in inches" },
                  height: { type: "number", description: "Height in inches" },
                  qty: { type: "integer", minimum: 1 },
                },
                required: ["description", "length", "width", "height", "qty"],
                additionalProperties: false,
              },
            },
            notes: { type: "string" },
          },
          required: ["pieces"],
          additionalProperties: false,
        },
      },
    };

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extract every freight piece from this build sheet. Return all dimensions in inches.",
              },
              { type: "image_url", image_url: { url: data.imageDataUrl } },
            ],
          },
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "extract_pieces" } },
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (res.status === 429) {
        throw new Error("Rate limit reached on the scanner. Please wait a moment and try again.");
      }
      if (res.status === 402) {
        throw new Error("AI credits exhausted. Add credits in Lovable Settings → Usage to keep scanning.");
      }
      throw new Error(`Scanner failed (${res.status}): ${body.slice(0, 200)}`);
    }

    const json = (await res.json()) as {
      choices?: Array<{
        message?: {
          tool_calls?: Array<{ function?: { arguments?: string } }>;
        };
      }>;
    };

    const argsStr = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!argsStr) {
      throw new Error("The scanner returned no structured result. Try a clearer photo.");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(argsStr);
    } catch {
      throw new Error("Could not parse scanner response.");
    }

    const result = ResultSchema.parse(parsed);
    return result;
  });
