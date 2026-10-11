import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Modal } from "./Modal";
import { useT } from "../i18n";

interface Props {
  /** How many torrents the move applies to. */
  count: number;
  /** The first one's current location, which the field starts at. */
  current: string;
  /** Its name, for the title when only one is selected. */
  name: string;
  /** Recent destinations to pick from. */
  dirHistory: string[];
  onClose: () => void;
  onSubmit: (location: string, moveData: boolean) => Promise<void>;
}

/**
 * Move a torrent's data to another folder on the daemon host.
 *
 * This is the original's TMoveTorrentForm. Two details of it are worth keeping
 * because they are what make it usable: the destination starts at where the
 * data is now, so the field shows the shape of a path rather than an empty box,
 * and the checkbox that decides whether the files are actually moved starts
 * checked - the dialog is called "set data location", but moving the data is
 * what people open it for.
 */
export function MoveLocationDialog({
  count,
  current,
  name,
  dirHistory,
  onClose,
  onSubmit,
}: Props) {
  const t = useT();
  const [location, setLocation] = useState(current);
  const [moveData, setMoveData] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const pickDir = async () => {
    const selected = await open({ directory: true, defaultPath: location || undefined });
    if (typeof selected === "string") setLocation(selected);
  };

  const submit = async () => {
    const v = location.trim();
    if (!v) return;
    setBusy(true);
    setError("");
    try {
      await onSubmit(v, moveData);
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const title = `${t("Torrent data location")} - ${
    count > 1 ? t("{n} selected", { n: count }) : name
  }`;

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {t("Cancel")}
          </button>
          <button className="btn primary" onClick={submit} disabled={busy || !location.trim()}>
            {busy ? t("Applying…") : t("Move…")}
          </button>
        </>
      }
    >
      {error && <div className="error inline">{error}</div>}
      <div className="field">
        <span>{t("New location for torrent data:")}</span>
        <div className="row">
          <input
            className="mono"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            list="move-dir-history"
            onKeyDown={(e) => e.key === "Enter" && void submit()}
            autoFocus
          />
          <datalist id="move-dir-history">
            {dirHistory.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
          <button className="btn" onClick={pickDir}>
            {t("Browse…")}
          </button>
        </div>
      </div>
      <label className="chk">
        <input type="checkbox" checked={moveData} onChange={(e) => setMoveData(e.target.checked)} />
        {t("Move torrent data from current location to new location")}
      </label>
    </Modal>
  );
}
