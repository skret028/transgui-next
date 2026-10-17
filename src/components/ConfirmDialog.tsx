import { useEffect, useRef, useState } from "react";
import { Modal } from "./Modal";
import { useT } from "../i18n";

interface Props {
  title: string;
  /** The question, worded as the original words it. */
  message: string;
  onClose: () => void;
  /** Runs only when the question was answered yes. */
  onConfirm: () => void | Promise<void>;
}

/**
 * A question with Yes and No, asked in the app's own window instead of by a
 * system alert.
 *
 * Two reasons not to use the system one here. The original answers "no" by
 * default - only an explicit Yes goes ahead - while a system alert's default
 * button is Yes, so a stray Return would have started a verification that reads
 * every piece back off the disk and stops the torrent seeding until it is done.
 * And a system alert cannot be reached by the accessibility tools this app is
 * checked with, so a question asked that way looks exactly like no question at
 * all: the check that a confirmation is asked before verifying could not tell
 * the difference, which is what sent this dialog in here.
 *
 * So No takes the focus, and Return and Escape both answer it; only a click on
 * Yes goes ahead.
 */
export function ConfirmDialog({ title, message, onClose, onConfirm }: Props) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const no = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    no.current?.focus();
  }, []);

  const yes = async () => {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
      onClose();
    }
  };

  return (
    <Modal
      title={title}
      width={420}
      onClose={onClose}
      footer={
        <>
          <button className="btn" ref={no} onClick={onClose}>
            {t("No")}
          </button>
          <button className="btn primary" onClick={() => void yes()} disabled={busy}>
            {t("Yes")}
          </button>
        </>
      }
    >
      <p className="confirm-text">{message}</p>
    </Modal>
  );
}
