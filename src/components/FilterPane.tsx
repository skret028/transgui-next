import { useMemo } from "react";
import type { Torrent } from "../types";
import { buildGroups, isSelected } from "../filterGroups";
import { ALL_SELECTION, type FilterSelection } from "../torrentList";
import { useT } from "../i18n";

interface Props {
  torrents: Torrent[];
  selection: FilterSelection;
  onSelect: (selection: FilterSelection) => void;
}

/**
 * Left-hand navigation: status, labels and download directories, each with a
 * count. Counts are over the whole list, so the pane still shows where things
 * are while one of its rows is the active filter.
 */
export function FilterPane({ torrents, selection, onSelect }: Props) {
  const t = useT();
  const groups = useMemo(() => buildGroups(torrents), [torrents]);

  return (
    <aside className="filter-pane">
      <button
        className={`pane-item ${selection.kind === "all" ? "active" : ""}`}
        onClick={() => onSelect(ALL_SELECTION)}
      >
        <span className="ellipsis">{t("All")}</span>
        <span className="muted">{torrents.length}</span>
      </button>

      {groups.map((group) => (
        <div key={group.kind} className="pane-group">
          <div className="pane-group-title">{t(group.labelKey)}</div>
          {group.items.length === 0 && <div className="pane-empty muted">—</div>}
          {group.items.map((item) => (
            <button
              key={item.key}
              className={`pane-item ${isSelected(selection, group.kind, item.key) ? "active" : ""}`}
              onClick={() => onSelect({ kind: group.kind, value: item.key })}
              title={item.label ?? t(item.labelKey ?? "")}
            >
              <span className="ellipsis">{item.label ?? t(item.labelKey ?? "")}</span>
              <span className="muted">{item.count}</span>
            </button>
          ))}
        </div>
      ))}
    </aside>
  );
}
