import { useEffect, useState, useCallback, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import type { Piece } from "./types";
import {
  listJobs as listJobsFn,
  upsertJob as upsertJobFn,
  deleteJob as deleteJobFn,
  bulkImportJobs as bulkImportJobsFn,
} from "@/lib/jobs.functions";

export interface Job {
  id: string;
  name: string;
  pieces: Piece[];
  maxCurbStack: number;
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = "loadfit:jobs:v1";
const ACTIVE_KEY = "loadfit:activeJobId:v1";
const IMPORTED_FLAG = "loadfit:cloudImported:v1";

interface LocalJob {
  id: string;
  name: string;
  pieces: Piece[];
  maxCurbStack?: number;
  createdAt: number;
  updatedAt: number;
}

function genTempId() {
  return `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readLocalJobs(): LocalJob[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as LocalJob[];
  } catch {
    return [];
  }
}

function clearLocalJobs() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* ignore */
  }
}

export function makeJob(name: string, pieces: Piece[] = []): Job {
  const now = Date.now();
  return {
    id: genTempId(),
    name,
    pieces,
    maxCurbStack: 3,
    createdAt: now,
    updatedAt: now,
  };
}

type RowJob = {
  id: string;
  name: string;
  pieces: Piece[];
  max_curb_stack: number;
  created_at: string;
  updated_at: string;
};

function fromRow(r: RowJob): Job {
  return {
    id: r.id,
    name: r.name,
    pieces: r.pieces ?? [],
    maxCurbStack: r.max_curb_stack ?? 3,
    createdAt: new Date(r.created_at).getTime(),
    updatedAt: new Date(r.updated_at).getTime(),
  };
}

export interface UseJobsApi {
  hydrated: boolean;
  jobs: Job[];
  activeId: string | null;
  activeJob: Job | null;
  createJob: (name?: string, pieces?: Piece[]) => Promise<Job | null>;
  selectJob: (id: string) => void;
  renameJob: (id: string, name: string) => Promise<void>;
  updatePieces: (id: string, pieces: Piece[]) => Promise<void>;
  updateMaxCurbStack: (id: string, value: number) => Promise<void>;
  deleteJob: (id: string) => Promise<void>;
}

export function useJobs(): UseJobsApi {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const listFn = useServerFn(listJobsFn);
  const upsertFn = useServerFn(upsertJobFn);
  const deleteFn = useServerFn(deleteJobFn);
  const bulkFn = useServerFn(bulkImportJobsFn);
  const importedRef = useRef(false);

  const refresh = useCallback(async () => {
    const { jobs: rows } = await listFn();
    const mapped = (rows as RowJob[]).map(fromRow);
    setJobs(mapped);
    return mapped;
  }, [listFn]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // Auto-import local jobs once
        if (!importedRef.current && typeof window !== "undefined") {
          const alreadyImported = window.localStorage.getItem(IMPORTED_FLAG);
          if (!alreadyImported) {
            const local = readLocalJobs();
            if (local.length > 0) {
              await bulkFn({
                data: {
                  jobs: local.map((j) => ({
                    name: j.name || "Untitled Job",
                    pieces: j.pieces ?? [],
                    max_curb_stack: j.maxCurbStack ?? 3,
                  })),
                },
              });
              clearLocalJobs();
            }
            window.localStorage.setItem(IMPORTED_FLAG, "1");
          }
          importedRef.current = true;
        }

        const mapped = await refresh();
        if (!mounted) return;
        const storedActive =
          typeof window !== "undefined"
            ? window.localStorage.getItem(ACTIVE_KEY)
            : null;
        const initial =
          (storedActive && mapped.find((j) => j.id === storedActive)?.id) ||
          mapped[0]?.id ||
          null;
        setActiveId(initial);
        setHydrated(true);
      } catch (err) {
        console.error("Failed to load jobs:", err);
        if (mounted) setHydrated(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [refresh, bulkFn]);

  // Re-load when auth changes
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        importedRef.current = false;
        refresh().catch(() => {});
      } else if (event === "SIGNED_OUT") {
        setJobs([]);
        setActiveId(null);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [refresh]);

  const persistActive = (id: string | null) => {
    if (typeof window === "undefined") return;
    try {
      if (id) window.localStorage.setItem(ACTIVE_KEY, id);
      else window.localStorage.removeItem(ACTIVE_KEY);
    } catch {
      /* ignore */
    }
  };

  const selectJob = useCallback((id: string) => {
    setActiveId(id);
    persistActive(id);
  }, []);

  const createJob = useCallback(
    async (name = "Untitled Job", pieces: Piece[] = []) => {
      try {
        const { id } = await upsertFn({
          data: { name, pieces, max_curb_stack: 3 },
        });
        const mapped = await refresh();
        const created = mapped.find((j) => j.id === id) ?? null;
        if (created) {
          setActiveId(created.id);
          persistActive(created.id);
        }
        return created;
      } catch (err) {
        console.error(err);
        return null;
      }
    },
    [upsertFn, refresh],
  );

  const updateJobField = useCallback(
    async (id: string, patch: Partial<Pick<Job, "name" | "pieces" | "maxCurbStack">>) => {
      const current = jobs.find((j) => j.id === id);
      if (!current) return;
      const next: Job = {
        ...current,
        ...patch,
        updatedAt: Date.now(),
      };
      // Optimistic update
      setJobs((prev) => prev.map((j) => (j.id === id ? next : j)));
      try {
        await upsertFn({
          data: {
            id,
            name: next.name,
            pieces: next.pieces,
            max_curb_stack: next.maxCurbStack,
          },
        });
      } catch (err) {
        console.error(err);
        // Re-sync on failure
        refresh().catch(() => {});
      }
    },
    [jobs, upsertFn, refresh],
  );

  const renameJob = useCallback(
    (id: string, name: string) => updateJobField(id, { name }),
    [updateJobField],
  );

  const updatePieces = useCallback(
    (id: string, pieces: Piece[]) => updateJobField(id, { pieces }),
    [updateJobField],
  );

  const updateMaxCurbStack = useCallback(
    (id: string, value: number) => updateJobField(id, { maxCurbStack: value }),
    [updateJobField],
  );

  const deleteJob = useCallback(
    async (id: string) => {
      try {
        await deleteFn({ data: { id } });
        const mapped = await refresh();
        if (activeId === id) {
          const fallback = mapped[0]?.id ?? null;
          setActiveId(fallback);
          persistActive(fallback);
        }
      } catch (err) {
        console.error(err);
      }
    },
    [deleteFn, refresh, activeId],
  );

  const activeJob = jobs.find((j) => j.id === activeId) ?? null;

  return {
    hydrated,
    jobs,
    activeId,
    activeJob,
    createJob,
    selectJob,
    renameJob,
    updatePieces,
    updateMaxCurbStack,
    deleteJob,
  };
}
