import { useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Modal } from "./Modal";
import { useT } from "../i18n";
import { rpc } from "../api";
import { formatBytes } from "../format";
import type { AddTorrentOptions, PreparedAdd } from "../types";

/** What the second stage decided about the files, the name and the limits. */
export interface AddChoices {
  /** The torrent's name on the daemon - the original's "Save as". */
  name: string;
  peerLimit: number;
  wanted: number[];
  unwanted: number[];
  /** Start it once the choices are in (the original's "start torrent"). */
  start: boolean;
}

interface Props {
  onClose: () => void;
  /**
   * Hand the torrent to the daemon - paused - and report what the daemon made
   * of it. Null means there is nothing left to configure: a repeat add, which
   * the caller has already explained, or a refusal it has already reported.
   */
  onPrepare: (options: AddTorrentOptions) => Promise<PreparedAdd | null>;
  onApply: (prepared: PreparedAdd, choices: AddChoices) => Promise<void>;
  /** Drop a torrent the user backed out of after it had been handed over. */
  onDiscard: (id: number) => Promise<void>;
  /** When true, the dialog is shown right after connecting. */
  defaultPaused?: boolean;
  /** Pre-fill the magnet/URL field (e.g. a link found on the clipboard). */
  initialSource?: string;
  /**
   * Pre-fill the download directory. The original does this for a torrent found
   * in the watched folder, when a watch destination folder is configured.
   */
  initialDownloadDir?: string;
  /** Recently used download directories, newest first. */
  dirHistory?: string[];
  /** The size the dialog was last left at; it can be dragged to a new one. */
  size?: { width: number; height: number };
  onSizeChange?: (size: { width: number; height: number }) => void;
}

export function AddTorrentDialog({
  onClose,
  onPrepare,
  onApply,
  onDiscard,
  defaultPaused = false,
  initialSource = "",
  initialDownloadDir = "",
  dirHistory = [],
  size,
  onSizeChange,
}: Props) {
  const t = useT();
  const [source, setSource] = useState(initialSource);
  const [file, setFile] = useState("");
  const [dir, setDir] = useState(initialDownloadDir);
  const [labels, setLabels] = useState("");
  const [paused, setPaused] = useState(defaultPaused);
  const [busy, setBusy] = useState(false);

  // The second stage. The original works the same way: it adds the torrent
  // first, paused, reads the file list back from the daemon, and only then
  // shows the contents grid, the name and the peer limit.
  const [prepared, setPrepared] = useState<PreparedAdd | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [name, setName] = useState("");
  const [peerLimit, setPeerLimit] = useState(0);
  const [start, setStart] = useState(!defaultPaused);
  const [free, setFree] = useState<number | null>(null);

  const pickFile = async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: "BitTorrent", extensions: ["torrent"] }],
    });
    if (typeof selected === "string") {
      setFile(selected);
      setSource("");
    }
  };

  // The daemon's own filesystem is not ours, so this picks a path on the local
  // machine and sends it as text; the daemon may or may not have it.
  const pickDir = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: t("Select a folder for download"),
    });
    if (typeof selected === "string") setDir(selected);
  };

  const canSubmit = source.trim().length > 0 || file.length > 0;

  /** Backing out after the hand-over drops it again, as the original does. */
  const cancel = () => {
    if (prepared) void onDiscard(prepared.id);
    onClose();
  };

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      const info = await onPrepare({
        filename: source.trim() || null,
        local_torrent_path: file || null,
        download_dir: dir.trim() || null,
        labels: labels
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        // Held paused while the user chooses, whatever the checkbox says: the
        // choice is applied by starting it afterwards.
        paused: true,
      });
      if (!info) return;
      setPrepared(info);
      setName(info.name);
      setPeerLimit(info.peerLimit);
      setStart(!paused);
      setChecked(new Set(info.files.map((_, i) => i)));
    } finally {
      setBusy(false);
    }
  };

  // How much room the daemon has where it put the torrent. Negative means it
  // could not stat the path, in which case the line is left out.
  useEffect(() => {
    if (!prepared) return;
    let live = true;
    void (async () => {
      try {
        const res = await rpc.freeSpace(prepared.downloadDir);
        if (live) setFree(res["size-bytes"]);
      } catch {
        if (live) setFree(null);
      }
    })();
    return () => {
      live = false;
    };
  }, [prepared]);

  const totals = useMemo(() => {
    let chosen = 0;
    let all = 0;
    prepared?.files.forEach((f, i) => {
      all += f.length;
      if (checked.has(i)) chosen += f.length;
    });
    return { chosen, all };
  }, [prepared, checked]);

  const toggle = (index: number) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const apply = async () => {
    if (!prepared) return;
    setBusy(true);
    try {
      const all = prepared.files.map((_, i) => i);
      await onApply(prepared, {
        name: name.trim(),
        peerLimit,
        wanted: all.filter((i) => checked.has(i)),
        unwanted: all.filter((i) => !checked.has(i)),
        start,
      });
    } finally {
      setBusy(false);
    }
  };

  if (prepared) {
    return (
      <Modal
        title={t("Add torrent")}
        onClose={cancel}
        footer={
          <>
            <button className="btn" onClick={cancel}>
              {t("Cancel")}
            </button>
            <button className="btn primary" onClick={apply} disabled={busy}>
              {busy ? t("Adding…") : t("Add")}
            </button>
          </>
        }
      >
        <label className="field">
          <span>{t("Save as")}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>

        <label className="field">
          <span>{t("Peer limit")}</span>
          <input
            type="number"
            min={0}
            className="narrow"
            value={peerLimit}
            onChange={(e) => setPeerLimit(Number(e.target.value) || 0)}
          />
        </label>

        {prepared.hasMetadata ? (
          <div className="field">
            <span>
              {t("Contents")} · {formatBytes(totals.chosen)} / {formatBytes(totals.all)}
              {free != null && free >= 0 ? ` · ${t("Free space")} ${formatBytes(free)}` : ""}
            </span>
            <div className="row">
              <button
                className="btn"
                onClick={() => setChecked(new Set(prepared.files.map((_, i) => i)))}
              >
                {t("Select all")}
              </button>
              <button className="btn" onClick={() => setChecked(new Set())}>
                {t("Select none")}
              </button>
            </div>
            <div className="file-picker">
              {prepared.files.map((f, i) => (
                <label key={i} className="chk" title={f.name}>
                  <input type="checkbox" checked={checked.has(i)} onChange={() => toggle(i)} />
                  <span className="ellipsis">{f.name}</span>
                  <span className="size">{formatBytes(f.length)}</span>
                </label>
              ))}
            </div>
          </div>
        ) : (
          <p className="muted">{t("The file list appears once the metadata has arrived.")}</p>
        )}

        <label className="chk">
          <input type="checkbox" checked={start} onChange={(e) => setStart(e.target.checked)} />
          {t("Start after adding")}
        </label>
      </Modal>
    );
  }

  return (
    <Modal
      title={t("Add torrent")}
      onClose={onClose}
      resizable
      width={size?.width}
      height={size?.height}
      onResizeEnd={onSizeChange}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {t("Cancel")}
          </button>
          <button className="btn primary" onClick={submit} disabled={busy || !canSubmit}>
            {busy ? t("Adding…") : t("Add")}
          </button>
        </>
      }
    >
      <label className="field">
        <span>{t("Magnet link / URL")}</span>
        <input
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder="magnet:?xt=… / http(s)://…"
        />
      </label>

      <div className="field">
        <span>{t("Or a local .torrent file")}</span>
        <div className="row">
          <input value={file} readOnly placeholder={t("(none selected)")} />
          <button className="btn" onClick={pickFile}>
            {t("Choose…")}
          </button>
          {file && (
            <button className="btn" onClick={() => setFile("")}>
              {t("Clear")}
            </button>
          )}
        </div>
      </div>

      <div className="field">
        <span>{t("Download directory (blank = server default)")}</span>
        <div className="row">
          <input
            value={dir}
            onChange={(e) => setDir(e.target.value)}
            placeholder="/downloads"
            list="dir-history"
          />
          <datalist id="dir-history">
            {dirHistory.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
          <button className="btn" onClick={pickDir}>
            {t("Browse…")}
          </button>
        </div>
      </div>

      <label className="field">
        <span>{t("Labels (comma separated)")}</span>
        <input
          value={labels}
          onChange={(e) => setLabels(e.target.value)}
          placeholder={t("e.g. movies, shows")}
        />
      </label>

      <label className="chk">
        <input type="checkbox" checked={paused} onChange={(e) => setPaused(e.target.checked)} />
        {t("Add paused (do not start)")}
      </label>
    </Modal>
  );
}
