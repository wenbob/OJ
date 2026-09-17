"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { FEEDBACK_IMAGE_TYPES, FEEDBACK_LIMITS } from "@/lib/feedbackShared";

type Screenshot = { file: File; url: string };

export function FeedbackForm({ basePath }: { basePath: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const urls = useRef(new Set<string>());
  const sending = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const current = urls.current;
    return () => { current.forEach((url) => URL.revokeObjectURL(url)); };
  }, []);

  function addFiles(files: File[]) {
    if (screenshots.length + files.length > FEEDBACK_LIMITS.attachments) {
      setError("每条反馈最多上传 3 张截图");
      return;
    }
    if (files.some((file) => !FEEDBACK_IMAGE_TYPES.includes(file.type) || file.size > FEEDBACK_LIMITS.fileBytes || !file.size)) {
      setError("请选择 PNG、JPEG 或 WebP 截图，单张不超过 5 MiB");
      return;
    }
    setError("");
    setScreenshots([...screenshots, ...files.map((file) => {
      const url = URL.createObjectURL(file);
      urls.current.add(url);
      return { file, url };
    })]);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current) return;
    sending.current = true;
    setPending(true);
    setError("");
    try {
      const body = new FormData();
      body.set("title", title);
      body.set("content", content);
      screenshots.forEach(({ file }) => body.append("attachments", file));
      const response = await fetch("/api/feedback", { method: "POST", body, signal: AbortSignal.timeout(45_000) });
      const data = await response.json();
      if (!response.ok) { setError(data.error || "提交失败，请稍后重试"); return; }
      if (!Number.isSafeInteger(data.id) || data.id <= 0) throw new Error("Invalid response");
      router.push(`${basePath}/${data.id}`);
      router.refresh();
    } catch {
      setError("网络异常或等待超时，内容已保留。请先检查“我的反馈”是否已提交，再尝试重试。");
    } finally {
      sending.current = false;
      setPending(false);
    }
  }

  return (
    <section className="surface p-5 md:p-7" aria-labelledby="feedback-form-title">
      <h2 id="feedback-form-title" className="text-xl font-black text-ink-950">提交反馈</h2>
      <p className="mt-2 text-sm leading-6 text-ink-600">请说明遇到的问题和操作步骤。仅你和管理员可以查看，请勿上传密码、密钥或其他人的隐私。</p>
      <form className="mt-5" onSubmit={submit}>
        <fieldset disabled={pending} className="min-w-0 space-y-4">
          <label className="block text-sm font-bold text-ink-800">
            标题
            <input className="field mt-2 w-full" required maxLength={FEEDBACK_LIMITS.title} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="用一句话描述问题" />
          </label>
          <div>
            <label htmlFor="feedback-content" className="block text-sm font-bold text-ink-800">问题描述</label>
            <textarea id="feedback-content" className="field mt-2 min-h-40 w-full resize-y" required maxLength={FEEDBACK_LIMITS.content} value={content} onChange={(event) => setContent(event.target.value)} placeholder="在哪个页面、进行了什么操作、出现了什么问题？" />
          </div>
          <label className="block text-sm font-bold text-ink-800">
            截图（可选）
            <input className="mt-2 block w-full max-w-full text-sm file:mr-3 file:border-0 file:bg-ink-950 file:px-3 file:py-3 file:text-white" type="file" accept={FEEDBACK_IMAGE_TYPES.join(",")} multiple aria-describedby="feedback-file-help" onChange={(event) => {
              addFiles(Array.from(event.target.files ?? []));
              event.target.value = "";
            }} />
          </label>
          <p id="feedback-file-help" className="text-xs leading-5 text-ink-600">最多 3 张静态 PNG / JPEG / WebP，单张不超过 5 MiB、1600 万像素；图片会压缩保存。</p>
          {screenshots.length > 0 && <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {screenshots.map(({ file, url }, index) => <li key={url} className="min-w-0 border border-ink-950/10 p-2">
              <Image unoptimized src={url} alt={`待上传截图 ${index + 1}`} width={320} height={200} className="h-28 w-full object-contain" />
              <p className="mt-2 truncate text-xs text-ink-600">{file.name}</p>
              <button type="button" className="btn btn-secondary mt-2 min-h-11 w-full px-3 py-2" aria-label={`移除截图 ${index + 1}`} onClick={() => {
                URL.revokeObjectURL(url);
                urls.current.delete(url);
                setScreenshots(screenshots.filter((image) => image.url !== url));
              }}>移除</button>
            </li>)}
          </ul>}
          <button className="btn btn-primary min-h-11" type="submit">{pending ? "正在提交…" : "提交反馈"}</button>
        </fieldset>
        {error && <p role="alert" className="mt-4 text-sm leading-6 text-red-700">{error}</p>}
      </form>
    </section>
  );
}
