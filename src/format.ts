// Presentation helpers for Transmission torrent data.

/** Transmission `status` enum -> 中文标签. */
export const STATUS_TEXT: Record<number, string> = {
  0: "已停止",
  1: "排队校验",
  2: "校验中",
  3: "排队下载",
  4: "下载中",
  5: "排队做种",
  6: "做种中",
};

export function statusText(t: { status: number; isStalled?: boolean }): string {
  const base = STATUS_TEXT[t.status] ?? `#${t.status}`;
  return t.isStalled ? `${base} (卡住)` : base;
}

export function statusClass(status: number): string {
  switch (status) {
    case 4:
      return "st-download";
    case 6:
      return "st-seed";
    case 2:
      return "st-check";
    case 0:
      return "st-stopped";
    default:
      return "st-queued";
  }
}

export function formatBytes(n: number | undefined | null): string {
  if (n == null || !Number.isFinite(n)) return "-";
  if (n === 0) return "0 B";
  const units = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  const v = n / Math.pow(1024, i);
  return `${v.toFixed(i === 0 ? 0 : v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${units[i]}`;
}

export function formatSpeed(n: number | undefined | null): string {
  if (n == null || !Number.isFinite(n)) return "-";
  if (n === 0) return "-";
  return `${formatBytes(n)}/s`;
}

export function formatRatio(r: number | undefined | null): string {
  if (r == null || !Number.isFinite(r)) return "-";
  return r.toFixed(2);
}

/** Transmission sends -1 (no estimate) / -2 (unknown) for eta. */
export function formatEta(seconds: number | undefined | null): string {
  if (seconds == null || seconds < 0) return "-";
  return formatDuration(seconds);
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return "-";
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor((seconds / 3600) % 24);
  const d = Math.floor(seconds / 86400);
  if (d > 0) return `${d}天 ${h}时`;
  if (h > 0) return `${h}时 ${m}分`;
  if (m > 0) return `${m}分 ${s}秒`;
  return `${s}秒`;
}

export function formatPercent(p: number | undefined | null): string {
  if (p == null || !Number.isFinite(p)) return "-";
  return `${(p * 100).toFixed(1)}%`;
}

export function formatDate(epochSeconds: number | undefined | null): string {
  if (!epochSeconds) return "-";
  return new Date(epochSeconds * 1000).toLocaleString();
}
