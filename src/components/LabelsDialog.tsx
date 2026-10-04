import { useState } from "react";
import { Modal } from "./Modal";
import { useT } from "../i18n";

interface Props {
  count: number;
  current: string[];
  known: string[];
  onClose: () => void;
  onApply: (labels: string[]) => Promise<void>;
}

export function LabelsDialog({ count, current, known, onClose, onApply }: Props) {
  const t = useT();
  const [text, setText] = useState(current.join(", "));
  const [busy, setBusy] = useState(false);

  const labels = text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const parsed = new Set(labels);
  const toggleKnown = (label: string) => {
    const next = new Set(parsed);
    if (next.has(label)) next.delete(label);
    else next.add(label);
    setText([...next].join(", "));
  };

  const apply = async () => {
    setBusy(true);
    try {
      await onApply(labels);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={t("Set labels ({n} torrents)", { n: count })}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {t("Cancel")}
          </button>
          <button className="btn primary" onClick={apply} disabled={busy}>
            {busy ? t("Applying…") : t("Apply")}
          </button>
        </>
      }
    >
      <label className="field">
        <span>{t("Labels (comma separated, blank clears)")}</span>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("e.g. movies, shows, favorites")}
        />
      </label>

      {known.length > 0 && (
        <>
          <div className="group">{t("Existing labels (click to toggle)")}</div>
          <div className="chips">
            {known.map((label) => (
              <button
                key={label}
                className={`chip ${parsed.has(label) ? "on" : ""}`}
                onClick={() => toggleKnown(label)}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}

      <p className="muted">{t("Applying will overwrite the current labels of these torrents.")}</p>
    </Modal>
  );
}
