"use client";

import { LogIn } from "lucide-react";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useState } from "react";

export function LoginForm({ reason }: { reason?: string }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await response.json();

    setPending(false);
    if (!response.ok) {
      setError(data.error ?? "登录失败");
      return;
    }

    router.push(data.redirectTo);
    router.refresh();
  }

  return (
    <form className="mt-8 grid gap-5" onSubmit={submit}>
      {reason ? (
        <p className="border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900" role="status">
          {reason === "session_replaced"
            ? "该账号已在其他设备登录，请重新登录。"
            : "登录状态已失效，请重新登录。"}
        </p>
      ) : null}
      <label className="grid gap-2 text-sm font-bold text-ink-800">
        用户名
        <input
          className="field"
          autoComplete="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
      </label>
      <label className="grid gap-2 text-sm font-bold text-ink-800">
        密码
        <input
          className="field"
          autoComplete="current-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      {error ? (
        <p className="form-error border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700" role="alert">
          {error}
        </p>
      ) : null}
      <button className="btn btn-primary w-full" disabled={pending} type="submit">
        <LogIn size={16} />
        {pending ? "登录中" : "登录"}
      </button>
    </form>
  );
}
