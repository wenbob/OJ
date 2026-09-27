"use client";

import { useEffect, useId, useSyncExternalStore } from "react";

// A granted overlay keeps its turn until released. Batch effect registrations so
// a submission -> AC -> reward transition cannot briefly admit an announcement.
export function createOverlayQueue() {
  const requests = new Map<string, number>();
  const listeners = new Set<() => void>();
  let owner: string | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  function schedule() {
    if (timer) return;
    timer = setTimeout(() => {
      timer = undefined;
      const next = owner && requests.has(owner) ? owner
        : [...requests].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      if (next !== owner) { owner = next; listeners.forEach((fn) => fn()); }
    }, 0);
  }
  return {
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    snapshot: () => owner,
    request(id: string, priority: number) { requests.set(id, priority); schedule(); return () => { requests.delete(id); schedule(); }; },
  };
}
const queue = createOverlayQueue();
const serverSnapshot = () => null;
export function useAutomaticOverlay(wanted: boolean, priority: number) {
  const id = useId();
  const owner = useSyncExternalStore(queue.subscribe, queue.snapshot, serverSnapshot);
  useEffect(() => wanted ? queue.request(id, priority) : undefined, [id, wanted, priority]);
  return wanted && owner === id;
}
