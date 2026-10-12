import { useState } from "react";
import { Modal } from "./Modal";
import { ALL_COLUMNS, DEFAULT_COLUMNS, columnDef, type ColumnId } from "../columns";
import { useT } from "../i18n";

interface Props {
  columns: ColumnId[];
  onClose: () => void;
  onApply: (columns: ColumnId[]) => void;
}

/**
 * Pick which columns the torrent list shows, and in what order.
 *
 * Ticking chooses a column; the list under the grid puts the chosen ones in the
 * order they will be drawn. The original's column setup has the same two halves
 * - the picker and its up/down buttons - because choosing and ordering are
 * different decisions, and a grid of checkboxes cannot express the second one.
 */
export function ColumnsDialog({ columns, onClose, onApply }: Props) {
  const t = useT();
  const [picked, setPicked] = useState<ColumnId[]>(columns);

  const toggle = (id: ColumnId) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const move = (id: ColumnId, delta: number) =>
    setPicked((p) => {
      const i = p.indexOf(id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= p.length) return p;
      const next = [...p];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  return (
    <Modal
      title={t("Columns")}
      onClose={onClose}
      width={560}
      footer={
        <>
          <button className="btn" onClick={() => setPicked(DEFAULT_COLUMNS)}>
            {t("Restore defaults")}
          </button>
          <span className="spacer" />
          <button className="btn" onClick={onClose}>
            {t("Cancel")}
          </button>
          <button
            className="btn primary"
            disabled={picked.length === 0}
            onClick={() => {
              onApply(picked);
              onClose();
            }}
          >
            {t("Apply")}
          </button>
        </>
      }
    >
      <p className="muted">{t("Choose which columns the torrent list shows.")}</p>
      <div className="col-picker">
        {ALL_COLUMNS.map((c) => (
          <label key={c.id} className="chk">
            <input type="checkbox" checked={picked.includes(c.id)} onChange={() => toggle(c.id)} />
            {t(c.labelKey)}
          </label>
        ))}
      </div>

      {picked.length > 0 && (
        <>
          <p className="muted">{t("Order in the list")}</p>
          <ul className="col-order">
            {picked.map((id, i) => (
              <li key={id}>
                <span className="col-order-name">{t(columnDef(id).labelKey)}</span>
                <button
                  className="btn"
                  disabled={i === 0}
                  onClick={() => move(id, -1)}
                  title={t("Move up")}
                >
                  ↑
                </button>
                <button
                  className="btn"
                  disabled={i === picked.length - 1}
                  onClick={() => move(id, 1)}
                  title={t("Move down")}
                >
                  ↓
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
}
