import { useState } from "react";
import { Modal } from "./Modal";
import { useT } from "../i18n";

interface Props {
  count: number;
  /** Current location, shown as context. */
  current: string;
  onClose: () => void;
  onSubmit: (location: string, moveData: boolean) => Promise<void>;
}

/** Move the torrent's data to another folder on the daemon host. */
export function MoveLocationDialog({ count, current, onClose, onSubmit }: Props) {
  const t = useT();
  const [location, setLocation] = useState("");
  const [moveData, setMoveData] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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

  return (
    <Modal
      title={t("Move data")}
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
      <p className="muted">
        {t("{n} selected", { n: count })} · {t("Current location")}:{" "}
        <span className="mono">{current}</span>
      </p>
      {error && <div className="error inline">{error}</div>}
      <label className="field">
        <span>{t("Destination")}</span>
        <input
          className="mono"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="/downloads/elsewhere"
          onKeyDown={(e) => e.key === "Enter" && void submit()}
          autoFocus
        />
      </label>
      <label className="chk">
        <input type="checkbox" checked={moveData} onChange={(e) => setMoveData(e.target.checked)} />
        {t("Move the data on disk")}
      </label>
      <p className="muted">{t("If unchecked, only the recorded location changes.")}</p>
    </Modal>
  );
}
