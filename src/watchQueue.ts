// The watch folder's waiting list.
//
// What the folder holds is the truth, not what has already been shown: each scan
// offers whatever `.torrent` files are in the folder, one dialog at a time, and a
// file that was cancelled stays in the folder and therefore comes round again -
// which is what the original does, and why turning on "delete the .torrent after
// a successful addition" is what makes a watch folder quiet.

/**
 * Add the files a scan turned up, in the order they were found, skipping any
 * that are already waiting so a file is not offered twice over.
 */
export function enqueue(waiting: string[], found: string[]): string[] {
  const out = [...waiting];
  for (const path of found) {
    if (!out.includes(path)) out.push(path);
  }
  return out;
}

/**
 * Take the next file to offer: the list without it, and the file itself (null
 * when nothing is waiting).
 */
export function take(waiting: string[]): { path: string | null; waiting: string[] } {
  if (waiting.length === 0) return { path: null, waiting };
  const [path, ...rest] = waiting;
  return { path, waiting: rest };
}
