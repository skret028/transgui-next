// Pure list logic for the torrent table: filtering and sorting.
// Kept free of React so it stays trivially testable.
import type { Torrent } from "./types";

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
  | "queuePosition";

export type SortDir = "asc" | "desc";

export interface StatusFilter {
  id: string;
  label: string;
  test: (t: Torrent) => boolean;
}

export const STATUS_FILTERS: StatusFilter[] = [
  { id: "all", label: "全部", test: () => true },
  { id: "active", label: "活动", test: (t) => t.rateDownload > 0 || t.rateUpload > 0 },
  { id: "downloading", label: "下载中", test: (t) => t.status === 4 },
  { id: "seeding", label: "做种中", test: (t) => t.status === 6 },
  { id: "checking", label: "校验中", test: (t) => t.status === 2 },
  { id: "stopped", label: "已停止", test: (t) => t.status === 0 },
  { id: "error", label: "错误", test: (t) => t.error > 0 },
];

export interface FilterOptions {
  text: string;
  statusId: string;
}

export function filterTorrents(list: Torrent[], opts: FilterOptions): Torrent[] {
  const q = opts.text.trim().toLowerCase();
  const status = STATUS_FILTERS.find((s) => s.id === opts.statusId) ?? STATUS_FILTERS[0];
  return list.filter((t) => {
    if (!status.test(t)) return false;
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
