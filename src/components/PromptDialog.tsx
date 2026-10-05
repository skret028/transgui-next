import { useState } from "react";
import { Modal } from "./Modal";
import { useT } from "../i18n";

interface Props {
  title: string;
  label: string;
  /** Read-only context shown above the input (e.g. the full path being edited). */
  context?: string;
  initial?: string;
  placeholder?: string;
  submitLabel?: string;
  onClose: () => void;
  onSubmit: (value: string) => Promise<void>;
}

/** One text field + OK/Cancel, used for renaming and tracker URLs. */
export function PromptDialog({
  title,
  label,
  context,
  initial = "",
  placeholder,
  submitLabel,
  onClose,
  onSubmit,
}: Props) {
  const t = useT();
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    const v = value.trim();
    if (!v) return;
    setBusy(true);
    setError("");
    try {
      await onSubmit(v);
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {t("Cancel")}
          </button>
          <button className="btn primary" onClick={submit} disabled={busy || !value.trim()}>
            {busy ? t("Applying…") : (submitLabel ?? t("Apply"))}
          </button>
        </>
      }
    >
      {context && <p className="muted mono ellipsis">{context}</p>}
      {error && <div className="error inline">{error}</div>}
      <label className="field">
        <span>{label}</span>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          onKeyDown={(e) => e.key === "Enter" && void submit()}
          autoFocus
        />
      </label>
    </Modal>
  );
}
