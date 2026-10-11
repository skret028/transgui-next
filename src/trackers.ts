/** One tracker as the daemon reports it. */
export interface Tracker {
  announce: string;
  id?: number;
}

/**
 * The three arrays `torrent-set` takes for trackers, in the order the original
 * builds them: additions, replacements, removals.
 */
export interface TrackerPatch {
  trackerAdd?: string[];
  /** Flat pairs - id, url, id, url - which is the daemon's own format. */
  trackerReplace?: (number | string)[];
  trackerRemove?: number[];
}

/**
 * Work out what changed between the trackers a torrent has and the list in the
 * edit box.
 *
 * This is the original's algorithm, kept as it is because the result is what
 * the daemon sees: blank lines are ignored; a line that matches a tracker
 * already there drops out of both sides, so an untouched tracker is never
 * rewritten; what is left is then paired up in order - each surplus line
 * replaces a surplus tracker, and whichever side has anything left over is
 * added or removed. A tracker the daemon gave no id for cannot be addressed, so
 * it is left alone rather than guessed at.
 */
export function trackerPatch(current: Tracker[], text: string): TrackerPatch {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  // Matching is by URL against every tracker, the id-less ones included: a line
  // that is already there is not a change, whatever the daemon said about its
  // id. Only the leftovers have to be addressable, since a replacement or a
  // removal needs an id to name.
  const matched = [...current];
  const edited: string[] = [];
  for (const line of lines) {
    const at = matched.findIndex((tr) => tr.announce === line);
    if (at >= 0) matched.splice(at, 1);
    else edited.push(line);
  }

  const addressable = matched.filter((tr) => typeof tr.id === "number" && tr.id > 0);
  const add: string[] = [];
  const replace: (number | string)[] = [];
  for (const line of edited) {
    const next = addressable.shift();
    if (next && typeof next.id === "number") replace.push(next.id, line);
    else add.push(line);
  }

  const remove = addressable
    .map((tr) => tr.id)
    .filter((id): id is number => typeof id === "number" && id > 0);

  const patch: TrackerPatch = {};
  if (add.length > 0) patch.trackerAdd = add;
  if (replace.length > 0) patch.trackerReplace = replace;
  if (remove.length > 0) patch.trackerRemove = remove;
  return patch;
}
