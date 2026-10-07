/**
 * The files tab's four-way picker, mapped onto Transmission's torrent-set
 * fields.
 *
 * Keep this pure and separate from the view: the field names and the
 * wanted/priority pairing are easy to get subtly wrong (a file that is
 * "selected" but still unwatched, a priority sent without re-wanting the file),
 * and the symptoms only show up as a torrent that quietly downloads the wrong
 * things.
 */
import type { FileStat } from "./types";

/** The states the picker offers, in menu order. */
export type FileMode = "skip" | "low" | "normal" | "high";

/** Current mode of a file, derived from the daemon's wanted/priority pair. */
export function fileMode(stat: FileStat | undefined): FileMode {
  if (!stat || !stat.wanted) return "skip";
  if (stat.priority === 1) return "high";
  if (stat.priority === -1) return "low";
  return "normal";
}

/**
 * torrent-set patch that puts one file into `mode`.
 *
 * `files-wanted` / `files-unwanted` take file indices; so do the `priority-*`
 * fields. Choosing a priority always re-wants the file, because the daemon
 * keeps the two independently and a bare priority change would leave a skipped
 * file skipped.
 */
export function filePatch(mode: FileMode, index: number): Record<string, unknown> {
  if (mode === "skip") return { "files-unwanted": [index] };
  const wanted = { "files-wanted": [index] };
  if (mode === "high") return { ...wanted, "priority-high": [index] };
  if (mode === "low") return { ...wanted, "priority-low": [index] };
  return { ...wanted, "priority-normal": [index] };
}

/** Patch that takes every index in `count` to the same mode. */
export function filePatchAll(mode: FileMode, count: number): Record<string, unknown> {
  const indices = Array.from({ length: count }, (_, i) => i);
  if (mode === "skip") return { "files-unwanted": indices };
  const wanted = { "files-wanted": indices };
  if (mode === "high") return { ...wanted, "priority-high": indices };
  if (mode === "low") return { ...wanted, "priority-low": indices };
  return { ...wanted, "priority-normal": indices };
}
