import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { ConnForm, ServerBookmark } from "../types";
import { useT } from "../i18n";
import { Modal } from "./Modal";

/** Ask for a PEM file. Only the path is kept - never the key material. */
async function pickPem(title: string, onPicked: (path: string) => void) {
  const picked = await open({ title, multiple: false, directory: false });
  if (typeof picked === "string") onPicked(picked);
}

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
  onRenameServer: (id: string, name: string) => void;
  onDeleteServer: (id: string) => void;
  onClose: () => void;
}

/**
 * The connection settings, in the dialog the original keeps them in
 * (connoptions.lfm): a list of saved connections on top, then the Connection
 * and Proxy pages. The main window has no connection row of its own - it shows
 * where it is connected in the status bar and offers connect/disconnect here.
 */
export function ConnectionsDialog({
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
  onRenameServer,
  onDeleteServer,
  onClose,
}: Props) {
  const t = useT();
  const locked = connected;
  const [tab, setTab] = useState<"connection" | "proxy">("connection");
  const [naming, setNaming] = useState<"save" | "rename" | null>(null);
  const [name, setName] = useState("");

  const startSave = () => {
    setName(`${form.host}:${form.port}`);
    setNaming("save");
  };

  const startRename = () => {
    const current = servers.find((s) => s.id === selectedServerId);
    if (!current) return;
    setName(current.name);
    setNaming("rename");
  };

  const confirmName = () => {
    const trimmed = name.trim();
    if (trimmed) {
      if (naming === "rename") onRenameServer(selectedServerId, trimmed);
      else onSaveServer(trimmed);
    }
    setNaming(null);
  };

  return (
    <Modal
      title={t("Manage connections")}
      onClose={onClose}
      width={520}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {t("Close")}
          </button>
          <span className="grow" />
          {connected ? (
            <button className="btn danger" onClick={onDisconnect}>
              {t("Disconnect")}
            </button>
          ) : (
            <button className="btn primary" onClick={onConnect} disabled={connecting}>
              {connecting ? t("Connecting…") : t("Connect")}
            </button>
          )}
        </>
      }
    >
      <div className="conn-profiles">
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
              onKeyDown={(e) => e.key === "Enter" && confirmName()}
              placeholder={t("Server name")}
              autoFocus
            />
            <button className="btn primary" onClick={confirmName}>
              {t("Save")}
            </button>
            <button className="btn" onClick={() => setNaming(null)}>
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
              onClick={startRename}
              disabled={!selectedServerId}
              title={t("Rename the selected server")}
            >
              {t("Rename")}
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
      </div>

      <div className="conn-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === "connection"}
          className={`conn-tab${tab === "connection" ? " active" : ""}`}
          onClick={() => setTab("connection")}
        >
          {t("Connection")}
        </button>
        <button
          role="tab"
          aria-selected={tab === "proxy"}
          className={`conn-tab${tab === "proxy" ? " active" : ""}`}
          onClick={() => setTab("proxy")}
        >
          {t("Proxy")}
        </button>
      </div>

      {tab === "connection" ? (
        <div className="conn-grid">
          <label htmlFor="conn-host">{t("Host")}</label>
          <input
            id="conn-host"
            className="mono"
            value={form.host}
            onChange={(e) => onChange("host", e.target.value)}
            disabled={locked}
          />

          <label htmlFor="conn-port">{t("Port")}</label>
          <input
            id="conn-port"
            className="narrow"
            value={form.port}
            onChange={(e) => onChange("port", e.target.value)}
            disabled={locked}
          />

          <label htmlFor="conn-user">{t("Username")}</label>
          <input
            id="conn-user"
            value={form.username}
            onChange={(e) => onChange("username", e.target.value)}
            disabled={locked}
          />

          <label htmlFor="conn-pass">{t("Password")}</label>
          <input
            id="conn-pass"
            type="password"
            value={form.password}
            onChange={(e) => onChange("password", e.target.value)}
            disabled={locked}
          />

          <span />
          <label className="chk">
            <input
              type="checkbox"
              checked={form.https}
              onChange={(e) => onChange("https", e.target.checked)}
              disabled={locked}
            />
            {t("HTTPS")}
          </label>

          <label htmlFor="conn-cert">{t("Client Certificate")}</label>
          <div className="conn-file">
            <input
              id="conn-cert"
              placeholder="client.crt"
              value={form.clientCert}
              onChange={(e) => onChange("clientCert", e.target.value)}
              disabled={locked}
            />
            <button
              type="button"
              className="btn"
              disabled={locked}
              onClick={() => void pickPem(t("Client Certificate"), (p) => onChange("clientCert", p))}
            >
              {t("Browse…")}
            </button>
          </div>

          <label htmlFor="conn-key">{t("Private Key")}</label>
          <div className="conn-file">
            <input
              id="conn-key"
              placeholder="client.key"
              value={form.clientKey}
              onChange={(e) => onChange("clientKey", e.target.value)}
              disabled={locked}
            />
            <button
              type="button"
              className="btn"
              disabled={locked}
              onClick={() => void pickPem(t("Private Key"), (p) => onChange("clientKey", p))}
            >
              {t("Browse…")}
            </button>
          </div>
        </div>
      ) : (
        <div className="conn-grid">
          <span />
          <label className="chk">
            <input
              type="checkbox"
              checked={form.proxyEnabled}
              onChange={(e) => onChange("proxyEnabled", e.target.checked)}
              disabled={locked}
            />
            {t("Connect to Transmission using proxy server")}
          </label>

          <label htmlFor="conn-proxy-host">{t("Proxy server")}</label>
          <input
            id="conn-proxy-host"
            value={form.proxyHost}
            onChange={(e) => onChange("proxyHost", e.target.value)}
            placeholder="proxy.example.com"
            disabled={locked || !form.proxyEnabled}
          />

          <label htmlFor="conn-proxy-port">{t("Proxy port")}</label>
          <input
            id="conn-proxy-port"
            className="narrow"
            value={form.proxyPort}
            onChange={(e) => onChange("proxyPort", e.target.value)}
            disabled={locked || !form.proxyEnabled}
          />

          <label htmlFor="conn-proxy-user">{t("Proxy user name")}</label>
          <input
            id="conn-proxy-user"
            value={form.proxyUsername}
            onChange={(e) => onChange("proxyUsername", e.target.value)}
            disabled={locked || !form.proxyEnabled}
          />

          <label htmlFor="conn-proxy-pass">{t("Proxy password")}</label>
          <input
            id="conn-proxy-pass"
            type="password"
            value={form.proxyPassword}
            onChange={(e) => onChange("proxyPassword", e.target.value)}
            disabled={locked || !form.proxyEnabled}
          />

          <span />
          <label className="chk">
            <input
              type="checkbox"
              checked={form.socks5}
              onChange={(e) => onChange("socks5", e.target.checked)}
              disabled={locked || !form.proxyEnabled}
            />
            SOCKS 5
          </label>
        </div>
      )}
    </Modal>
  );
}
