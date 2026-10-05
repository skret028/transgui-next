// Shared domain types mirroring the Transmission RPC payloads we request.

export interface Torrent {
  id: number;
  name: string;
  hashString: string;
  status: number;
  totalSize: number;
  sizeWhenDone: number;
  leftUntilDone: number;
  percentDone: number;
  rateDownload: number;
  rateUpload: number;
  uploadRatio: number;
  eta: number;
  uploadedEver: number;
  downloadedEver: number;
  downloadDir: string;
  addedDate: number;
  doneDate: number;
  activityDate: number;
  isPrivate: boolean;
  isFinished: boolean;
  isStalled: boolean;
  labels?: string[];
  peersConnected: number;
  peersGettingFromUs: number;
  peersSendingToUs: number;
  queuePosition: number;
  recheckProgress: number;
  error: number;
  errorString: string;
  comment: string;
  creator: string;
  magnetLink: string;
  pieceCount: number;
  pieceSize: number;
  secondsDownloading: number;
  secondsSeeding: number;
}

export interface TorrentFile {
  name: string;
  length: number;
  bytesCompleted: number;
}

export interface FileStat {
  bytesCompleted: number;
  wanted: boolean;
  priority: number;
}

export interface Peer {
  address: string;
  clientName: string;
  rateToPeer: number;
  rateToClient: number;
  progress: number;
  flagStr: string;
  port: number;
  isEncrypted: boolean;
  isIncoming: boolean;
}

export interface TrackerStat {
  id: number;
  host: string;
  announce: string;
  announceState: number;
  lastAnnounceResult: string;
  seederCount: number;
  leecherCount: number;
  lastAnnounceSucceeded: boolean;
  lastAnnounceTime: number;
}

export interface TorrentDetail extends Torrent {
  files?: TorrentFile[];
  fileStats?: FileStat[];
  peers?: Peer[];
  trackerStats?: TrackerStat[];
  bandwidthPriority: number;
  uploadLimit: number;
  downloadLimit: number;
  uploadLimited: boolean;
  downloadLimited: boolean;
  seedRatioLimit: number;
  seedRatioMode: number;
  honorSessionLimits?: boolean;
}

export interface ConnForm {
  host: string;
  port: string;
  path: string;
  username: string;
  password: string;
  https: boolean;
  acceptInvalid: boolean;
}

/** A saved server/connection bookmark. */
export interface ServerBookmark {
  id: string;
  name: string;
  form: ConnForm;
}

export interface ConnectResult {
  version: string;
  rpcVersion: number;
}

export interface AddTorrentOptions {
  filename?: string | null;
  local_torrent_path?: string | null;
  download_dir?: string | null;
  labels?: string[] | null;
  paused?: boolean | null;
}

/** Subset of session-get fields surfaced in the settings dialog. */
export interface SessionInfo {
  version: string;
  "rpc-version": number;
  "download-dir": string;
  "incomplete-dir": string;
  "incomplete-dir-enabled": boolean;
  "speed-limit-down": number;
  "speed-limit-down-enabled": boolean;
  "speed-limit-up": number;
  "speed-limit-up-enabled": boolean;
  "alt-speed-down": number;
  "alt-speed-up": number;
  "alt-speed-enabled": boolean;
  "peer-port": number;
  "peer-port-random-on-start": boolean;
  encryption: string;
  "dht-enabled": boolean;
  "pex-enabled": boolean;
  "lpd-enabled": boolean;
  "utp-enabled": boolean;
  "start-added-torrents": boolean;
  "rename-partial-files": boolean;
  "seedRatioLimit": number;
  "seedRatioLimited": boolean;
  "port-forwarding-enabled": boolean;
  "alt-speed-time-enabled": boolean;
  /** Minutes since midnight, 0-1439. */
  "alt-speed-time-begin": number;
  "alt-speed-time-end": number;
  /** Bit mask: 1 = Sunday, 2 = Monday, … 64 = Saturday. */
  "alt-speed-time-day": number;
  "peer-limit-global": number;
  "peer-limit-per-torrent": number;
  "download-queue-enabled": boolean;
  "download-queue-size": number;
  "seed-queue-enabled": boolean;
  "seed-queue-size": number;
  "queue-stalled-enabled": boolean;
  "queue-stalled-minutes": number;
  "cache-size-mb": number;
  "idle-seeding-limit-enabled": boolean;
  "idle-seeding-limit": number;
  "blocklist-enabled": boolean;
  "blocklist-url": string;
  "blocklist-size": number;
  "trash-original-torrent-files": boolean;
  "default-trackers": string;
  /** Session default: fetch pieces in order instead of rarest-first. */
  sequential_download: boolean;
  /** Transports allowed for peer connections, e.g. ["tcp", "utp"]. */
  preferred_transports?: string[];
  "anti-brute-force-enabled": boolean;
  "anti-brute-force-threshold": number;
  "script-torrent-added-enabled": boolean;
  "script-torrent-added-filename": string;
  "script-torrent-done-enabled": boolean;
  "script-torrent-done-filename": string;
  "script-torrent-done-seeding-enabled": boolean;
  "script-torrent-done-seeding-filename": string;
  [key: string]: unknown;
}

/** One bucket of `session-stats` (current session or cumulative). */
export interface StatsBucket {
  downloadedBytes: number;
  uploadedBytes: number;
  filesAdded: number;
  secondsActive: number;
  sessionCount?: number;
}

export interface SessionStats {
  activeTorrentCount: number;
  pausedTorrentCount: number;
  torrentCount: number;
  downloadSpeed: number;
  uploadSpeed: number;
  "cumulative-stats": StatsBucket;
  "current-stats": StatsBucket;
}

export interface FreeSpace {
  path: string;
  /** Bytes free. Negative means the daemon could not stat the path. */
  "size-bytes": number;
  /** Present on success (snake_case). */
  total_size?: number;
  /** Present only on the daemon's failure path, where it uses camelCase. */
  totalSize?: number;
}

export interface PortTest {
  "port-is-open": boolean;
}
