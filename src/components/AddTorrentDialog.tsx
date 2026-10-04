import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Modal } from "./Modal";
import { useT } from "../i18n";
import type { AddTorrentOptions } from "../types";

interface Props {
  onClose: () => void;
  onSubmit: (options: AddTorrentOptions) => Promise<void>;
  /** When true, the dialog is shown right after connecting. */
  defaultPaused?: boolean;
}

export function AddTorrentDialog({ onClose, onSubmit, defaultPaused = false }: Props) {
  const t = useT();
  const [source, setSource] = useState("");
  const [file, setFile] = useState("");
  const [dir, setDir] = useState("");
  const [labels, setLabels] = useState("");
  const [paused, setPaused] = useState(defaultPaused);
  const [busy, setBusy] = useState(false);

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

  const canSubmit = source.trim().length > 0 || file.length > 0;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      await onSubmit({
        filename: source.trim() || null,
        local_torrent_path: file || null,
        download_dir: dir.trim() || null,
        labels: labels
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        paused,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={t("Add torrent")}
      onClose={onClose}
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

      <label className="field">
        <span>{t("Download directory (blank = server default)")}</span>
        <input value={dir} onChange={(e) => setDir(e.target.value)} placeholder="/downloads" />
      </label>

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
