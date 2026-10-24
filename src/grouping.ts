// Grouping for the torrent list, the original's three View-menu switches.
//
// Pure, so what a group is and how the headings are ordered stays testable, and
// the table itself is only presentation.
import { trackerHostOf } from "./trackerInfo.ts";
import type { Torrent } from "./types";
import type { ViewOptions } from "./settings";

/** Which of the original's three switches is in play, if any. */
export type GroupMode = "folder" | "label" | "tracker";

/** A heading row: the value things are grouped by, and how many are under it. */
export interface GroupHeading {
  kind: "group";
  /** The grouping value, used as the row key. */
  key: string;
  /** What the heading shows. Empty values get a dash. */
  label: string;
  count: number;
}

export type ListRow<T> = { kind: "torrent"; torrent: T } | GroupHeading;

type Switches = Pick<ViewOptions, "folderGrouping" | "labelGrouping" | "trackerGrouping">;

/**
 * The grouping the view asks for, or null.
 *
 * The original has three independent switches and they all start on. Its grid
 * component lives in a separate package that is not part of its repository, so
 * whether the three nested could not be read out of the source. What is done
 * here is one dimension at a time, in the order the switches appear in its View
 * menu - folder, then label, then tracker - so with all three on, which is how
 * they start, the list groups by folder.
 */
export function activeGrouping(view: Switches): GroupMode | null {
  if (view.folderGrouping) return "folder";
  if (view.labelGrouping) return "label";
  if (view.trackerGrouping) return "tracker";
  return null;
}

/**
 * What a torrent is grouped by, and what its heading says.
 *
 * The values are the ones the list already shows in its columns, so a group
 * heading never says something the rows under it do not: the download directory,
 * the tracker host, or the labels as they are written in the Labels column.
 */
export function groupKeyOf(row: Torrent, mode: GroupMode): { key: string; label: string } {
  if (mode === "folder") {
    const dir = row.downloadDir || "";
    return { key: dir, label: dir || "—" };
  }
  if (mode === "tracker") {
    const host = trackerHostOf(row);
    return { key: host, label: host || "—" };
  }
  const labels = (row.labels ?? []).filter((l) => l.trim() !== "");
  const text = labels.join(", ");
  return { key: text, label: text || "—" };
}

/**
 * The list as rows: headings with their torrents beneath them.
 *
 * The torrents are taken in the order they arrive, which is the list's current
 * sort, so grouping only inserts headings and never reorders within a group. The
 * groups themselves are ordered by their value, with the empty one first.
 */
export function groupRows<T extends Torrent>(list: T[], mode: GroupMode | null): ListRow<T>[] {
  if (!mode) return list.map((torrent) => ({ kind: "torrent", torrent }));

  const groups = new Map<string, { label: string; rows: T[] }>();
  for (const row of list) {
    const { key, label } = groupKeyOf(row, mode);
    const group = groups.get(key);
    if (group) group.rows.push(row);
    else groups.set(key, { label, rows: [row] });
  }

  const ordered = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const out: ListRow<T>[] = [];
  for (const [key, group] of ordered) {
    out.push({ kind: "group", key, label: group.label, count: group.rows.length });
    for (const row of group.rows) out.push({ kind: "torrent", torrent: row });
  }
  return out;
}
