"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  return (
    <button
      className="btn btn-secondary"
      disabled={pending}
      onClick={logout}
      type="button"
    >
      <LogOut size={16} />
      {pending ? "退出中" : "退出"}
    </button>
  );
}
