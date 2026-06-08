import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PieceSchema = z.object({
  id: z.string(),
  description: z.string().default(""),
  length: z.number(),
  width: z.number(),
  height: z.number(),
  qty: z.number(),
  orientation: z.enum(["as-entered", "on-side", "upright"]),
  weight: z.number().optional(),
  insulated: z.boolean().optional(),
});

export const listJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("jobs")
      .select("id, name, pieces, max_curb_stack, created_at, updated_at")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { jobs: data ?? [] };
  });

export const upsertJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().min(1).max(200),
        pieces: z.array(PieceSchema).max(500),
        max_curb_stack: z.number().int().min(1).max(10).default(3),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const payload = {
      user_id: context.userId,
      name: data.name,
      pieces: data.pieces,
      max_curb_stack: data.max_curb_stack,
    };
    if (data.id) {
      const { data: row, error } = await context.supabase
        .from("jobs")
        .update(payload)
        .eq("id", data.id)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return { id: row.id };
    }
    const { data: row, error } = await context.supabase
      .from("jobs")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("jobs").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const bulkImportJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        jobs: z
          .array(
            z.object({
              name: z.string().min(1).max(200),
              pieces: z.array(PieceSchema).max(500),
              max_curb_stack: z.number().int().min(1).max(10).default(3),
            }),
          )
          .max(100),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (data.jobs.length === 0) return { count: 0 };
    const rows = data.jobs.map((j) => ({
      user_id: context.userId,
      name: j.name,
      pieces: j.pieces,
      max_curb_stack: j.max_curb_stack,
    }));
    const { error } = await context.supabase.from("jobs").insert(rows);
    if (error) throw new Error(error.message);
    return { count: rows.length };
  });
