import { useState } from "react";
import { useT } from "../i18n";
import type { ViewOptions } from "../settings";

interface Props {
  view: ViewOptions;
  onChange: (view: ViewOptions) => void;
}

/** Dropdown of show/hide toggles for the main chrome regions. */
export function ViewMenu({ view, onChange }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);

  const items: { key: keyof ViewOptions; label: string }[] = [
    { key: "toolbar", label: "Toolbar" },
    { key: "filterPane", label: "Filter pane" },
    { key: "details", label: "Details pane" },
    { key: "statusBar", label: "Status bar" },
    { key: "bigToolbar", label: "Big toolbar" },
  ];

  return (
    <div className="dropdown-wrap">
      <button className="btn" title={t("View")} onClick={() => setOpen((o) => !o)}>
        {t("View")} ▾
      </button>
      {open && (
        <>
          <div className="dropdown-backdrop" onClick={() => setOpen(false)} />
          <div className="dropdown view-menu">
            {items.map((it) => (
              <label key={it.key} className="chk">
                <input
                  type="checkbox"
                  checked={view[it.key]}
                  onChange={(e) => onChange({ ...view, [it.key]: e.target.checked })}
                />
                {t(it.label)}
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
