import { useState } from "react";
import type { ConnForm, ServerBookmark } from "../types";
import { useT } from "../i18n";

interface Props {
  form: ConnForm;
  connected: boolean;
  connecting: boolean;
  servers: ServerBookmark[];
  selectedServerId: string;
  onChange: <K extends keyof ConnForm>(key: K, value: ConnForm[K]) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onSelectServer: (id: string) => void;
  onSaveServer: (name: string) => void;
  onDeleteServer: (id: string) => void;
}

export function ConnectionBar({
  form,
  connected,
  connecting,
  servers,
  selectedServerId,
  onChange,
  onConnect,
  onDisconnect,
  onSelectServer,
  onSaveServer,
  onDeleteServer,
}: Props) {
  const t = useT();
  const locked = connected;
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  const startSave = () => {
    setName(`${form.host}:${form.port}`);
    setNaming(true);
  };

  const confirmSave = () => {
    const trimmed = name.trim();
    if (trimmed) onSaveServer(trimmed);
    setNaming(false);
  };

  return (
    <section className="conn-form">
      <select
        className="server-select"
        value={selectedServerId}
        onChange={(e) => onSelectServer(e.target.value)}
        disabled={locked}
        title={t("Saved servers")}
      >
        <option value="">{t("(select a server…)")}</option>
        {servers.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>

      {naming ? (
        <>
          <input
            className="narrow-wide"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && confirmSave()}
            placeholder={t("Server name")}
            autoFocus
          />
          <button className="btn primary" onClick={confirmSave}>
            {t("Save")}
          </button>
          <button className="btn" onClick={() => setNaming(false)}>
            {t("Cancel")}
          </button>
        </>
      ) : (
        <>
          <button className="btn" onClick={startSave} title={t("Bookmark the current connection")}>
            {t("Bookmark…")}
          </button>
          <button
            className="btn"
            onClick={() => onDeleteServer(selectedServerId)}
            disabled={!selectedServerId}
            title={t("Delete the selected server")}
          >
            {t("Delete")}
          </button>
        </>
      )}

      <span className="conn-sep" />

      <input
        className="mono"
        value={form.host}
        onChange={(e) => onChange("host", e.target.value)}
        placeholder={t("Host")}
        disabled={locked}
      />
      <input
        className="narrow"
        value={form.port}
        onChange={(e) => onChange("port", e.target.value)}
        placeholder={t("Port")}
        disabled={locked}
      />
      <input
        value={form.username}
        onChange={(e) => onChange("username", e.target.value)}
        placeholder={t("Username")}
        disabled={locked}
      />
      <input
        type="password"
        value={form.password}
        onChange={(e) => onChange("password", e.target.value)}
        placeholder={t("Password")}
        disabled={locked}
      />
      <label className="chk">
        <input
          type="checkbox"
          checked={form.https}
          onChange={(e) => onChange("https", e.target.checked)}
          disabled={locked}
        />
        HTTPS
      </label>
      {connected ? (
        <button className="btn danger" onClick={onDisconnect}>
          {t("Disconnect")}
        </button>
      ) : (
        <button className="btn primary" onClick={onConnect} disabled={connecting}>
          {connecting ? t("Connecting…") : t("Connect")}
        </button>
      )}
    </section>
  );
}
