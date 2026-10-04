import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Modal } from "./Modal";
import type { AddTorrentOptions } from "../types";

interface Props {
  onClose: () => void;
  onSubmit: (options: AddTorrentOptions) => Promise<void>;
  /** When true, the dialog is shown right after connecting. */
  defaultPaused?: boolean;
}

export function AddTorrentDialog({ onClose, onSubmit, defaultPaused = false }: Props) {
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
      title="添加种子"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            取消
          </button>
          <button className="btn primary" onClick={submit} disabled={busy || !canSubmit}>
            {busy ? "添加中…" : "添加"}
          </button>
        </>
      }
    >
      <label className="field">
        <span>磁力链接 / URL</span>
        <input
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder="magnet:?xt=… 或 http(s)://…"
        />
      </label>

      <div className="field">
        <span>或本地 .torrent 文件</span>
        <div className="row">
          <input value={file} readOnly placeholder="（未选择）" />
          <button className="btn" onClick={pickFile}>
            选择…
          </button>
          {file && (
            <button className="btn" onClick={() => setFile("")}>
              清除
            </button>
          )}
        </div>
      </div>

      <label className="field">
        <span>下载目录（留空用服务器默认）</span>
        <input value={dir} onChange={(e) => setDir(e.target.value)} placeholder="/downloads" />
      </label>

      <label className="field">
        <span>标签（逗号分隔）</span>
        <input value={labels} onChange={(e) => setLabels(e.target.value)} placeholder="电影, 剧集" />
      </label>

      <label className="chk">
        <input type="checkbox" checked={paused} onChange={(e) => setPaused(e.target.checked)} />
        添加后暂停（不自动开始）
      </label>
    </Modal>
  );
}
