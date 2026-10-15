// Pure list logic for the torrent table: filtering and sorting.
// Kept free of React so it stays trivially testable.
import type { Torrent } from "./types";
// The extension is spelled out so the list logic can be loaded by the test
// scripts under plain node, which (unlike Vite) does not resolve extensionless
// paths. tsconfig allows it, and Vite accepts it unchanged.
import { trackerHostOf } from "./trackerInfo.ts";

export type SortKey =
  | "name"
  | "status"
  | "sizeWhenDone"
  | "percentDone"
  | "rateDownload"
  | "rateUpload"
  | "uploadRatio"
  | "eta"
  | "addedDate"
  | "downloadedEver"
  | "queuePosition";

export type SortDir = "asc" | "desc";

export interface StatusFilter {
  id: string;
  labelKey: string;
  test: (t: Torrent) => boolean;
}

/**
 * The status rows, in the original's order and with the original's tests.
 *
 * The original's eight are: all, downloading, finished, active, inactive,
 * stopped, error and waiting. "Finished" is a torrent that is done or seeding,
 * and "Waiting" covers the three queued-to-start states - so a torrent being
 * checked is "waiting", not a category of its own, and a torrent seeding is
 * "finished". Keeping the same eight in the same order is what makes the
 * original's Alt+1..Alt+8 row shortcuts mean the same thing here.
 */
export const STATUS_FILTERS: StatusFilter[] = [
  { id: "all", labelKey: "All", test: () => true },
  { id: "downloading", labelKey: "Downloading", test: (t) => t.status === 4 },
  { id: "finished", labelKey: "Finished", test: (t) => t.status === 6 || t.percentDone >= 1 },
  { id: "active", labelKey: "Active", test: (t) => t.rateDownload > 0 || t.rateUpload > 0 },
  // Not moving, and not stopped either: queued or waiting its turn.
  {
    id: "inactive",
    labelKey: "Inactive",
    test: (t) => t.rateDownload === 0 && t.rateUpload === 0 && t.status !== 0,
  },
  { id: "stopped", labelKey: "Stopped", test: (t) => t.status === 0 },
  { id: "error", labelKey: "Error", test: (t) => t.error > 0 },
  // Queued to check, checking, or queued to download - the original's trio.
  {
    id: "waiting",
    labelKey: "Waiting",
    test: (t) => t.status === 1 || t.status === 2 || t.status === 3,
  },
];

export interface FilterOptions {
  text: string;
  selection: FilterSelection;
}

/**
 * What the list is currently scoped to. `status` reuses the STATUS_FILTERS ids,
 * `label`/`dir` compare against the torrent's own values.
 */
export interface FilterSelection {
  kind: "all" | "status" | "label" | "dir" | "tracker";
  value: string;
}

export const ALL_SELECTION: FilterSelection = { kind: "all", value: "" };

/** The selection as a status-filter id, for the top-bar dropdown. */
export function statusIdOf(sel: FilterSelection): string {
  return sel.kind === "status" ? sel.value : "all";
}

export function matchesSelection(t: Torrent, sel: FilterSelection): boolean {
  switch (sel.kind) {
    case "all":
      return true;
    case "status": {
      const f = STATUS_FILTERS.find((s) => s.id === sel.value);
      return f ? f.test(t) : true;
    }
    case "label":
      return (t.labels ?? []).includes(sel.value);
    case "dir":
      return t.downloadDir === sel.value;
    case "tracker":
      return trackerHostOf(t) === sel.value;
  }
}

export function filterTorrents(list: Torrent[], opts: FilterOptions): Torrent[] {
  const q = opts.text.trim().toLowerCase();
  return list.filter((t) => {
    if (!matchesSelection(t, opts.selection)) return false;
    if (!q) return true;
    if (t.name.toLowerCase().includes(q)) return true;
    if ((t.labels ?? []).some((l) => l.toLowerCase().includes(q))) return true;
    if (t.hashString.toLowerCase().startsWith(q)) return true;
    return false;
  });
}

export function sortTorrents(list: Torrent[], key: SortKey, dir: SortDir): Torrent[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...list].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (typeof av === "string" && typeof bv === "string") {
      return av.localeCompare(bv) * sign;
    }
    const an = Number(av) || 0;
    const bn = Number(bv) || 0;
    return (an - bn) * sign;
  });
}

/** Next sort direction when a header is clicked (cycle asc -> desc). */
export function nextDir(current: SortDir, isSameKey: boolean): SortDir {
  if (!isSameKey) return "asc";
  return current === "asc" ? "desc" : "asc";
}

/** A torrent has all of its data. */
export function isFinished(t: Torrent): boolean {
  return (t.percentDone ?? 0) >= 1;
}

/**
 * Torrents that have finished but were not complete when we last looked.
 *
 * `seen` is the caller's running set of ids already accounted for (complete
 * torrents present at startup go straight into it), so this never fires a burst
 * of notifications for a library that was already finished.
 */
export function pickNewlyFinished(list: Torrent[], seen: Set<number>): Torrent[] {
  return list.filter((t) => isFinished(t) && !seen.has(t.id));
}

/** Seed `seen` with everything already complete, e.g. right after connecting. */
export function seedFinished(list: Torrent[], seen: Set<number>): void {
  for (const t of list) if (isFinished(t)) seen.add(t.id);
}
