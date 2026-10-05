/**
 * Translating daemon paths into paths this machine can actually open.
 *
 * A daemon on a NAS or in a container reports its own filesystem view
 * ("/downloads"), which usually does not exist here. A mapping table pairs a
 * daemon-side prefix with the prefix this machine mounts it under.
 */

export interface PathMapping {
  /** Prefix as the daemon sees it, e.g. `/downloads`. */
  remote: string;
  /** Prefix as this machine sees it, e.g. `/Volumes/media/downloads`. */
  local: string;
}

/** Hosts whose filesystem this app shares. */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function isLocalHost(host: string): boolean {
  return LOCAL_HOSTS.has(host.trim().toLowerCase());
}

function isSep(ch: string | undefined): boolean {
  return ch === "/" || ch === "\\";
}

/** Strip trailing separators so `/a/b/` and `/a/b` behave the same. */
export function trimTrailing(p: string): string {
  const s = (p ?? "").trim();
  let end = s.length;
  while (end > 1 && isSep(s[end - 1])) end--;
  return s.slice(0, end);
}

/**
 * The part of `path` below `base`, or null when `base` is not a prefix of it.
 * A mapping must land on a separator boundary: `/downloads` must not swallow
 * `/downloads2`, which belongs to a different directory.
 */
function remainderUnder(path: string, base: string): string | null {
  const b = trimTrailing(base);
  if (!b || !path.startsWith(b)) return null;
  const rest = path.slice(b.length);
  if (rest && !isSep(rest[0])) return null;
  return rest;
}

function joinLocal(local: string, rest: string): string {
  const l = trimTrailing(local);
  const tail = trimTrailing(rest).replace(/^[/\\]+/, "");
  if (!tail) return l;
  if (isSep(l[l.length - 1])) return l + tail;
  // A Windows local root keeps its own separator style.
  const sep = l.includes("\\") && !l.includes("/") ? "\\" : "/";
  return l + sep + tail;
}

/**
 * Rewrite a daemon path into this machine's view. The longest matching remote
 * prefix wins, so a specific `/downloads/tv` beats a general `/downloads`.
 * Returns null when nothing matches.
 */
export function mapPath(path: string, mappings: PathMapping[]): string | null {
  const p = trimTrailing(path);
  if (!p) return null;
  let best: string | null = null;
  let bestLen = -1;
  for (const m of mappings ?? []) {
    const remote = trimTrailing(m?.remote ?? "");
    const local = trimTrailing(m?.local ?? "");
    if (!remote || !local) continue;
    const rest = remainderUnder(p, remote);
    if (rest === null) continue;
    if (remote.length > bestLen) {
      bestLen = remote.length;
      best = joinLocal(local, rest);
    }
  }
  return best;
}

/**
 * What to hand the OS for a daemon path.
 *
 * A mapping always wins, even for a daemon on this machine: a containerised
 * daemon sees its own mount points ("/downloads") and those usually do not
 * exist on the host even though the host is localhost. With no mapping the
 * daemon path is usable only when the daemon shares this filesystem; otherwise
 * nothing here can open it.
 */
export function revealPathFor(
  remotePath: string,
  host: string,
  mappings: PathMapping[],
): string | null {
  const p = trimTrailing(remotePath);
  if (!p) return null;
  const mapped = mapPath(p, mappings);
  if (mapped !== null) return mapped;
  return isLocalHost(host) ? p : null;
}

/** Drop blank rows and coerce a value from the settings store into shape. */
export function normalizePathMap(value: unknown): PathMapping[] {
  if (!Array.isArray(value)) return [];
  const out: PathMapping[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const r = row as Partial<PathMapping>;
    const remote = typeof r.remote === "string" ? r.remote.trim() : "";
    const local = typeof r.local === "string" ? r.local.trim() : "";
    if (!remote && !local) continue;
    out.push({ remote, local });
  }
  return out;
}
