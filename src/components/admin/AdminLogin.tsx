"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AdminLogin() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setBusy(false);
    if (response.ok) {
      router.refresh();
    } else {
      setError("That password was not accepted.");
      setPassword("");
    }
  }

  return (
    <div className="mx-auto max-w-sm pt-16">
      <form onSubmit={submit} className="panel space-y-3 p-5">
        <h1 className="text-lg font-semibold">Admin</h1>
        <p className="text-[13px] text-ink-300">
          Enter the admin password to edit items, hero stats and abilities.
        </p>
        <input
          type="password"
          className="input"
          placeholder="Password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="text-[13px] text-red-400">{error}</p>}
        <button className="btn btn-primary w-full" disabled={busy || !password}>
          {busy ? "Checking…" : "Unlock"}
        </button>
        <p className="text-[11px] text-ink-500">
          Set with the <code>ADMIN_PASSWORD</code> environment variable. In development it defaults
          to <code>admin</code>.
        </p>
      </form>
    </div>
  );
}
