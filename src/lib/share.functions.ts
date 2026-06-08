import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const createShareLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ jobId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: job, error: jobErr } = await context.supabase
      .from("jobs")
      .select("id, name, pieces, max_curb_stack")
      .eq("id", data.jobId)
      .single();
    if (jobErr || !job) throw new Error("Job not found");

    const token = randomBytes(18).toString("base64url");
    const { error } = await context.supabase.from("share_links").insert({
      token,
      job_id: job.id,
      user_id: context.userId,
      name: job.name,
      pieces: job.pieces,
      max_curb_stack: job.max_curb_stack,
    });
    if (error) throw new Error(error.message);
    return { token };
  });

export const getShareLink = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z.object({ token: z.string().min(8).max(64) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("share_links")
      .select("token, name, pieces, max_curb_stack, created_at")
      .eq("token", data.token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Share link not found");
    return row;
  });
