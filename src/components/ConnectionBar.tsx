import type { ConnForm } from "../types";

interface Props {
  form: ConnForm;
  connected: boolean;
  connecting: boolean;
  onChange: <K extends keyof ConnForm>(key: K, value: ConnForm[K]) => void;
  onConnect: () => void;
  onDisconnect: () => void;
}

export function ConnectionBar({
  form,
  connected,
  connecting,
  onChange,
  onConnect,
  onDisconnect,
}: Props) {
  const locked = connected;
  return (
    <section className="conn-form">
      <input
        className="mono"
        value={form.host}
        onChange={(e) => onChange("host", e.target.value)}
        placeholder="主机"
        disabled={locked}
      />
      <input
        className="narrow"
        value={form.port}
        onChange={(e) => onChange("port", e.target.value)}
        placeholder="端口"
        disabled={locked}
      />
      <input
        value={form.username}
        onChange={(e) => onChange("username", e.target.value)}
        placeholder="用户名"
        disabled={locked}
      />
      <input
        type="password"
        value={form.password}
        onChange={(e) => onChange("password", e.target.value)}
        placeholder="密码"
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
          断开
        </button>
      ) : (
        <button className="btn primary" onClick={onConnect} disabled={connecting}>
          {connecting ? "连接中…" : "连接"}
        </button>
      )}
    </section>
  );
}
