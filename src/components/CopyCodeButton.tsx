"use client";

import { Copy } from "lucide-react";
import { useState } from "react";
import { copyToClipboard } from "@/lib/copyToClipboard";

type CopyCodeButtonProps = {
  code?: string;
  endpoint?: string;
  className?: string;
  idleLabel?: string;
  ariaLabel?: string;
};

export function CopyCodeButton({
  code,
  endpoint,
  className = "btn btn-secondary px-3 py-2 text-sm whitespace-nowrap",
  idleLabel = "复制代码",
  ariaLabel,
}: CopyCodeButtonProps) {
  const [status, setStatus] = useState<"idle" | "copied" | "error" | "loading">(
    "idle",
  );

  async function copyCode() {
    setStatus("loading");

    try {
      let nextCode = code;

      if (!nextCode && endpoint) {
        const response = await fetch(endpoint);
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error ?? "获取代码失败");
        }
        nextCode = data.submission?.code;
      }

      if (!nextCode) {
        throw new Error("没有可复制的代码");
      }

      await copyToClipboard(nextCode);
      setStatus("copied");
      window.setTimeout(() => setStatus("idle"), 1600);
    } catch {
      setStatus("error");
      window.setTimeout(() => setStatus("idle"), 2400);
    }
  }

  const label =
    status === "loading"
      ? "复制中"
      : status === "copied"
        ? "已复制"
        : status === "error"
          ? "复制失败"
          : idleLabel;

  return (
    <button aria-label={status === "idle" ? ariaLabel : label} className={className} disabled={status === "loading"} onClick={copyCode} type="button">
      <Copy aria-hidden="true" size={15} />
      {label}
    </button>
  );
}
