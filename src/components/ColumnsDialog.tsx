import { useState } from "react";
import { Modal } from "./Modal";
import { ALL_COLUMNS, DEFAULT_COLUMNS, type ColumnId } from "../columns";
import { useT } from "../i18n";

interface Props {
  columns: ColumnId[];
  onClose: () => void;
  onApply: (columns: ColumnId[]) => void;
}

/** Pick which columns the torrent list shows. */
export function ColumnsDialog({ columns, onClose, onApply }: Props) {
  const t = useT();
  const [picked, setPicked] = useState<ColumnId[]>(columns);

  const toggle = (id: ColumnId) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <Modal
      title={t("Columns")}
      onClose={onClose}
      width={520}
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
    </Modal>
  );
}
