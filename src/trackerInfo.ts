/**
 * The swarm and tracker facts the list columns read off a torrent.
 *
 * Two things here are easy to get wrong in a renderer: Transmission reports
 * swarm size per tracker rather than per torrent, and a tracker that has not
 * announced yet reports -1 rather than 0 - so "no data" has to stay
 * distinguishable from "zero peers". Keeping the derivation out of the view
 * means the rules can be asserted directly.
 */
import type { Torrent } from "./types";

export interface Swarm {
  /** Largest seeder count any tracker reports; -1 when nothing is known. */
  seeds: number;
  /** Largest leecher count any tracker reports; -1 when nothing is known. */
  leechers: number;
  /** The first tracker's host, as the Tracker column shows it. */
  host: string;
  /** The first tracker's last announce result. */
  status: string;
}

export function bestSwarm(row: Torrent): Swarm {
  const stats = row.trackerStats ?? [];
  if (stats.length === 0) return { seeds: -1, leechers: -1, host: "", status: "" };
  return {
    seeds: Math.max(...stats.map((s) => s.seederCount)),
    leechers: Math.max(...stats.map((s) => s.leecherCount)),
    host: stats[0].host ?? "",
    status: stats[0].lastAnnounceResult ?? "",
  };
}

/** Message key for a torrent's bandwidth priority. */
export function priorityKey(bandwidthPriority: number): string {
  if (bandwidthPriority === 1) return "High priority";
  if (bandwidthPriority === -1) return "Low priority";
  return "Normal priority";
}
