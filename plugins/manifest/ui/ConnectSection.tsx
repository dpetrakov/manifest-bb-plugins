// Раздел настроек «Подключение к Manifest»: вход по email и паролю. Пароль
// уходит в Manifest один раз (HTTPS) и обменивается на токен; плагин хранит
// только токен (секрет на сервере BB). Пароль задаётся в Manifest.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorText, useStatus } from "./hooks";

export function ConnectSection() {
  const { status, error, rpc } = useStatus();
  const [url, setUrl] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const signIn = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const s = await rpc.call("login", { url: url || status?.url || "", email: email || status?.email || "", password });
      setPassword("");
      setMessage(s.connected ? `Подключено как ${s.email}` : s.message);
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const signOut = async () => {
    setBusy(true);
    try {
      await rpc.call("logout", null);
      setMessage("Вы вышли: токен отозван в Manifest.");
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex max-w-xl flex-col gap-3 text-sm">
      <p className="text-muted-foreground">
        Пароль для плагина задаётся в Manifest: администратор — в «Пользователи и права», или вы сами — кликом по
        своему имени внизу меню Manifest. Плагин не хранит пароль: он один раз обменивается на токен.
      </p>
      {error && <p className="text-destructive">{error}</p>}
      {status && (
        <p>
          {status.connected ? (
            <>
              Подключено к <b>{status.url}</b> как <b>{status.email}</b>
              {status.canManage ? " · просмотр и правка" : status.canView ? " · только просмотр" : " · нет доступа к реестру"}
            </>
          ) : (
            <span className="text-muted-foreground">{status.message}</span>
          )}
        </p>
      )}
      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Адрес Manifest</span>
        <Input value={url} placeholder={status?.url || "https://manifest.example.com"} onChange={(e) => setUrl(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Email</span>
        <Input value={email} placeholder={status?.email || "name@company.com"} autoComplete="username" onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Пароль для плагина</span>
        <Input type="password" value={password} autoComplete="current-password" onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && password) void signIn(); }} />
      </label>
      <div className="flex gap-2">
        <Button disabled={busy || !password || !(url || status?.url) || !(email || status?.email)} onClick={() => void signIn()}>
          {busy ? "Входим…" : "Войти"}
        </Button>
        {status?.connected && (
          <Button variant="outline" disabled={busy} onClick={() => void signOut()}>Выйти</Button>
        )}
      </div>
      {message && <p role="status">{message}</p>}
    </div>
  );
}
