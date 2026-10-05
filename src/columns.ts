// The torrent table's column registry.
//
// Kept free of React: the table renders cells by id, so this file stays plain
// data and the defaults/validation are trivially testable.
import type { SortKey } from "./torrentList";

export type ColumnId =
  | "name"
  | "status"
  | "size"
  | "progress"
  | "down"
  | "up"
  | "ratio"
  | "eta"
  | "labels"
  | "peers"
  | "added"
  | "downloaded"
  | "queue"
  | "dir";

export interface ColumnDef {
  id: ColumnId;
  /** Source string, also the i18n key. */
  labelKey: string;
  /** Sort key when the header is clickable. */
  sortKey?: SortKey;
  /** Right-align numeric columns. */
  num?: boolean;
  className?: string;
  defaultVisible: boolean;
}

export const ALL_COLUMNS: ColumnDef[] = [
  { id: "name", labelKey: "Name", sortKey: "name", className: "col-name", defaultVisible: true },
  { id: "status", labelKey: "Status", sortKey: "status", defaultVisible: true },
  { id: "size", labelKey: "Size", sortKey: "sizeWhenDone", num: true, defaultVisible: true },
  { id: "progress", labelKey: "Progress", sortKey: "percentDone", className: "col-prog", defaultVisible: true },
  { id: "down", labelKey: "Download", sortKey: "rateDownload", num: true, defaultVisible: true },
  { id: "up", labelKey: "Upload", sortKey: "rateUpload", num: true, defaultVisible: true },
  { id: "ratio", labelKey: "Ratio", sortKey: "uploadRatio", num: true, defaultVisible: true },
  { id: "eta", labelKey: "Remaining", sortKey: "eta", num: true, defaultVisible: true },
  { id: "labels", labelKey: "Labels", defaultVisible: true },
  { id: "peers", labelKey: "Peer", num: true, defaultVisible: true },
  { id: "added", labelKey: "Added", sortKey: "addedDate", defaultVisible: false },
  { id: "downloaded", labelKey: "Downloaded", sortKey: "downloadedEver", num: true, defaultVisible: false },
  { id: "queue", labelKey: "Queue position", sortKey: "queuePosition", num: true, defaultVisible: false },
  { id: "dir", labelKey: "Download directory", defaultVisible: false },
];

export const DEFAULT_COLUMNS: ColumnId[] = ALL_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.id);

const BY_ID = new Map(ALL_COLUMNS.map((c) => [c.id, c]));

export const columnDef = (id: ColumnId): ColumnDef => BY_ID.get(id)!;

/**
 * Coerce a persisted value into a usable column list.
 *
 * Unknown ids are dropped (a downgrade must not resurrect a removed column) and
 * the result is put back into registry order so the table layout is stable
 * regardless of the order the user ticked the boxes in.
 */
export function normalizeColumns(value: unknown): ColumnId[] {
  if (!Array.isArray(value)) return DEFAULT_COLUMNS;
  const wanted = new Set(value.filter((v): v is ColumnId => typeof v === "string" && BY_ID.has(v as ColumnId)));
  const ordered = ALL_COLUMNS.filter((c) => wanted.has(c.id)).map((c) => c.id);
  // An empty selection would leave a table with nothing but checkboxes.
  return ordered.length > 0 ? ordered : DEFAULT_COLUMNS;
}
