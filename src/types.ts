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
  [key: string]: unknown;
}
