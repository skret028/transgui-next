// The torrent list's right-click menu.
//
// Deliberately plain: sections are rendered inline (a heading followed by its
// items) rather than as hover-flyout submenus. A flyout is one mis-aimed
// pointer move away from dismissing the menu, and everything here is a single
// click either way.
import { useEffect, useRef } from "react";
import { useT } from "../i18n";

export interface MenuItem {
  /** Action id, or null for a separator. */
  id: string | null;
  labelKey: string;
  /** Rendered as a labelled section under the item. */
  children?: MenuItem[];
  danger?: boolean;
}

interface Props {
  x: number;
  y: number;
  items: MenuItem[];
  onPick: (id: string) => void;
  onClose: () => void;
}

const WIDTH = 220;
/** Roughly one row per item, used only to decide whether to flip the menu up. */
const ROW = 26;

export function ContextMenu({ x, y, items, onPick, onClose }: Props) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // mousedown rather than click: the menu should be gone before whatever is
    // underneath handles the press.
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);

  const rows = items.reduce((n, i) => n + 1 + (i.children?.length ?? 0), 0);
  const left = Math.max(4, Math.min(x, window.innerWidth - WIDTH - 4));
  const top = Math.max(4, Math.min(y, Math.max(4, window.innerHeight - rows * ROW - 8)));

  return (
    <div className="ctx-menu" ref={ref} style={{ left, top, width: WIDTH }} role="menu">
      {items.map((item, i) => {
        const id = item.id;
        if (id === null) return <div className="ctx-sep" key={`sep-${i}`} />;
        if (item.children) {
          return (
            <div key={id}>
              <div className="ctx-head">{t(item.labelKey)}</div>
              {item.children.map((child) => (
                <button
                  key={child.id}
                  className={`ctx-item ctx-sub${child.danger ? " danger" : ""}`}
                  onClick={() => onPick(child.id!)}
                >
                  {t(child.labelKey)}
                </button>
              ))}
            </div>
          );
        }
        return (
          <button
            key={id}
            className={`ctx-item${item.danger ? " danger" : ""}`}
            onClick={() => onPick(id)}
          >
            {t(item.labelKey)}
          </button>
        );
      })}
    </div>
  );
}
