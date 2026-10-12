import { useEffect, useRef, type ReactNode } from "react";
import { useT } from "../i18n";

interface Props {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  width?: number;
  /** Let the dialog be dragged to a different size and report the result. */
  resizable?: boolean;
  height?: number;
  onResizeEnd?: (size: { width: number; height: number }) => void;
}

/** Minimal modal shell used by the dialog components. */
export function Modal({
  title,
  children,
  footer,
  onClose,
  width = 470,
  resizable = false,
  height,
  onResizeEnd,
}: Props) {
  const t = useT();
  const box = useRef<HTMLDivElement>(null);

  // The size is reported once, when the dialog goes away, which is when the
  // original writes its add dialog's size out. The callback is expected to be
  // stable: it is an effect dependency, so an inline one would fire early.
  useEffect(() => {
    if (!resizable || !onResizeEnd) return;
    return () => {
      const el = box.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      onResizeEnd({ width: Math.round(rect.width), height: Math.round(rect.height) });
    };
  }, [resizable, onResizeEnd]);

  // Esc closes the dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className={`modal${resizable ? " resizable" : ""}`}
        style={{ width, ...(resizable && height ? { height } : {}) }}
        ref={box}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <span className="modal-title">{title}</span>
          <button className="btn icon" onClick={onClose} aria-label={t("Close")}>
            ✕
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}
