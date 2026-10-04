import { useState } from "react";
import type { ConnForm, ServerBookmark } from "../types";

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
        title="已保存的服务器"
      >
        <option value="">（选择服务器…）</option>
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
            placeholder="服务器名称"
            autoFocus
          />
          <button className="btn primary" onClick={confirmSave}>
            保存
          </button>
          <button className="btn" onClick={() => setNaming(false)}>
            取消
          </button>
        </>
      ) : (
        <>
          <button className="btn" onClick={startSave} title="把当前连接存为书签">
            存为…
          </button>
          <button
            className="btn"
            onClick={() => onDeleteServer(selectedServerId)}
            disabled={!selectedServerId}
            title="删除选中的服务器"
          >
            删除
          </button>
        </>
      )}

      <span className="conn-sep" />

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
