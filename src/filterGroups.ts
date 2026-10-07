// Group totals for the filter pane. Pure, so the counting rules stay testable
// and the pane itself is just presentation.
import type { Torrent } from "./types";
import { STATUS_FILTERS, type FilterSelection } from "./torrentList";
import { trackerHostOf } from "./trackerInfo";

export interface FilterItem {
  /** Selection value for this row. */
  key: string;
  /** i18n key (status rows) … */
  labelKey?: string;
  /** … or a literal value (labels and directories are user data). */
  label?: string;
  count: number;
}

export interface FilterGroup {
  kind: "status" | "label" | "dir" | "tracker";
  labelKey: string;
  items: FilterItem[];
}

const byCountThenName = (a: [string, number], b: [string, number]) =>
  b[1] - a[1] || a[0].localeCompare(b[0]);

function tally(values: Iterable<string>): Map<string, number> {
  const m = new Map<string, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return m;
}

/**
 * The groups shown in the pane, each with its own count.
 *
 * Counts are taken over the whole list, not the filtered one: a group is a way
 * to *change* the filter, so it has to keep showing where the torrents are even
 * while one of its siblings is selected.
 */
export function buildGroups(list: Torrent[]): FilterGroup[] {
  // "all" is the pane's own top row, so it does not belong in the status group.
  const status: FilterItem[] = STATUS_FILTERS.filter((s) => s.id !== "all").map((s) => ({
    key: s.id,
    labelKey: s.labelKey,
    count: list.filter(s.test).length,
  }));

  const labels = tally(list.flatMap((t) => t.labels ?? []));
  const dirs = tally(list.map((t) => t.downloadDir).filter(Boolean));
  // A torrent with no tracker yet (a magnet whose metadata has not arrived)
  // has nowhere to file, so it simply does not appear in this group.
  const trackers = tally(list.map(trackerHostOf).filter(Boolean));

  const toItems = (m: Map<string, number>): FilterItem[] =>
    [...m.entries()].sort(byCountThenName).map(([key, count]) => ({ key, label: key, count }));

  return [
    { kind: "status", labelKey: "Status", items: status },
    { kind: "label", labelKey: "Labels", items: toItems(labels) },
    { kind: "dir", labelKey: "Download directory", items: toItems(dirs) },
    { kind: "tracker", labelKey: "Tracker", items: toItems(trackers) },
  ];
}

export function isSelected(sel: FilterSelection, kind: string, key: string): boolean {
  return sel.kind === kind && sel.value === key;
}
