import { useEffect, useState, useCallback } from "react";
import type { Piece } from "./types";

export interface Job {
  id: string;
  name: string;
  pieces: Piece[];
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = "loadfit:jobs:v1";
const ACTIVE_KEY = "loadfit:activeJobId:v1";

function genId() {
  return `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readJobs(): Job[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as Job[];
  } catch {
    return [];
  }
}

function writeJobs(jobs: Job[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
  } catch {
    /* quota or private mode — ignore */
  }
}

function readActiveId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

function writeActiveId(id: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (id) window.localStorage.setItem(ACTIVE_KEY, id);
    else window.localStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* ignore */
  }
}

export function makeJob(name: string, pieces: Piece[] = []): Job {
  const now = Date.now();
  return { id: genId(), name, pieces, createdAt: now, updatedAt: now };
}

export interface UseJobsApi {
  hydrated: boolean;
  jobs: Job[];
  activeId: string | null;
  activeJob: Job | null;
  createJob: (name?: string, pieces?: Piece[]) => Job;
  selectJob: (id: string) => void;
  renameJob: (id: string, name: string) => void;
  updatePieces: (id: string, pieces: Piece[]) => void;
  deleteJob: (id: string) => void;
}

export function useJobs(seed: () => Job): UseJobsApi {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage on mount
  useEffect(() => {
    let stored = readJobs();
    let active = readActiveId();
    if (stored.length === 0) {
      const seeded = seed();
      stored = [seeded];
      active = seeded.id;
      writeJobs(stored);
      writeActiveId(active);
    } else if (!active || !stored.some((j) => j.id === active)) {
      active = stored[0].id;
      writeActiveId(active);
    }
    setJobs(stored);
    setActiveId(active);
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persist = useCallback((next: Job[]) => {
    setJobs(next);
    writeJobs(next);
  }, []);

  const createJob = useCallback(
    (name = "Untitled Job", pieces: Piece[] = []) => {
      const job = makeJob(name, pieces);
      const next = [job, ...jobs];
      persist(next);
      setActiveId(job.id);
      writeActiveId(job.id);
      return job;
    },
    [jobs, persist],
  );

  const selectJob = useCallback((id: string) => {
    setActiveId(id);
    writeActiveId(id);
  }, []);

  const renameJob = useCallback(
    (id: string, name: string) => {
      const next = jobs.map((j) =>
        j.id === id ? { ...j, name, updatedAt: Date.now() } : j,
      );
      persist(next);
    },
    [jobs, persist],
  );

  const updatePieces = useCallback(
    (id: string, pieces: Piece[]) => {
      const next = jobs.map((j) =>
        j.id === id ? { ...j, pieces, updatedAt: Date.now() } : j,
      );
      persist(next);
    },
    [jobs, persist],
  );

  const deleteJob = useCallback(
    (id: string) => {
      const next = jobs.filter((j) => j.id !== id);
      persist(next);
      if (activeId === id) {
        const fallback = next[0]?.id ?? null;
        setActiveId(fallback);
        writeActiveId(fallback);
      }
    },
    [jobs, activeId, persist],
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
    deleteJob,
  };
}
