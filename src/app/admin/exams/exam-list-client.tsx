"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { ProblemTypeBadge } from "@/components/ProblemTypeBadge";
import { formatDate } from "@/lib/format";

type ExamListItem = {
  id: number;
  title: string;
  description: string | null;
  durationMin: number | null;
  status: string;
  examType: string;
  createdAt: Date | string;
  createdBy: {
    role: string;
    username: string;
  } | null;
  _count: { problems: number };
};

export function ExamListClient({
  basePath,
  exams,
}: {
  basePath: "/admin" | "/teacher";
  exams: ExamListItem[];
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pendingId, setPendingId] = useState<number | null>(null);

  async function mutate(url: string, options?: RequestInit) {
    setMessage("");
    setPendingId(Number(url.match(/exams\/(\d+)/)?.[1] ?? 0) || null);
    try {
      const response = await fetch(url, options);
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setMessage(data.error ?? "操作失败");
        return;
      }

      setMessage("操作成功");
      router.refresh();
    } catch {
      setMessage("网络异常，操作失败，请检查连接后重试");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <>
      {message ? (
        <p className="mx-5 mt-4 border border-ink-950/10 bg-white/70 px-3 py-2 text-sm font-semibold text-ink-700">
          {message}
        </p>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] border-collapse">
          <thead>
            <tr className="border-b border-ink-950/10 bg-white/55 text-left">
              <th className="table-head px-5 py-3">考试名称</th>
              <th className="table-head px-5 py-3">状态</th>
              <th className="table-head px-5 py-3">类型</th>
              <th className="table-head px-5 py-3">题目数</th>
              <th className="table-head px-5 py-3">时长</th>
              <th className="table-head px-5 py-3">创建时间</th>
              <th className="table-head px-5 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {exams.map((exam) => (
              <tr className="border-b border-ink-950/10" key={exam.id}>
                <td className="px-5 py-4">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <p className="font-black">{exam.title}</p>
                    <span
                      className="inline-flex max-w-48 border border-clay/25 bg-clay/10 px-2 py-1 text-[10px] font-black text-clay"
                      title={
                        exam.createdBy
                          ? `出卷人：${exam.createdBy.username}`
                          : "出卷人：未记录"
                      }
                    >
                      <span className="truncate">
                        出卷人：{exam.createdBy?.username ?? "未记录"}
                      </span>
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm font-semibold text-ink-600">
                    {exam.description || "暂无说明"}
                  </p>
                </td>
                <td className="px-5 py-4">
                  <StatusBadge status={exam.status} />
                </td>
                <td className="px-5 py-4">
                  <ProblemTypeBadge type={exam.examType} />
                </td>
                <td className="px-5 py-4 text-sm font-semibold text-ink-700">
                  {exam._count.problems}
                </td>
                <td className="px-5 py-4 text-sm font-semibold text-ink-700">
                  {exam.durationMin ? `${exam.durationMin} 分钟` : "不限时"}
                </td>
                <td className="px-5 py-4 text-sm font-semibold text-ink-700">
                  {formatDate(new Date(exam.createdAt))}
                </td>
                <td className="px-5 py-4 text-right">
                  <div className="flex flex-wrap justify-end gap-2">
                    <Link
                      className="btn btn-secondary px-3 py-2 text-sm"
                      href={`${basePath}/exams/${exam.id}/practice`}
                    >
                      进入做题
                    </Link>
                    <Link
                      className="btn btn-secondary px-3 py-2 text-sm"
                      href={`${basePath}/exams/${exam.id}/edit`}
                    >
                      编辑
                    </Link>
                    <Link
                      className="btn btn-secondary px-3 py-2 text-sm"
                      href={`${basePath}/exams/${exam.id}/records`}
                    >
                      考试记录
                    </Link>
                    {exam.status === "published" ? (
                      <button
                        className="btn btn-secondary px-3 py-2 text-sm"
                        disabled={pendingId === exam.id}
                        onClick={() =>
                          mutate(`/api/admin/exams/${exam.id}/unpublish`, {
                            method: "POST",
                          })
                        }
                        type="button"
                      >
                        取消发布
                      </button>
                    ) : exam.status === "draft" ? (
                      <button
                        className="btn btn-primary px-3 py-2 text-sm"
                        disabled={pendingId === exam.id}
                        onClick={() =>
                          mutate(`/api/admin/exams/${exam.id}/publish`, {
                            method: "POST",
                          })
                        }
                        type="button"
                      >
                        发布
                      </button>
                    ) : null}
                    <button
                      className="btn btn-danger px-3 py-2 text-sm"
                      disabled={pendingId === exam.id}
                      onClick={() => {
                        if (
                          !window.confirm(
                            `确定要删除考试《${exam.title}》吗？该操作可能影响考试记录，请谨慎操作。`,
                          )
                        ) {
                          return;
                        }
                        mutate(`/api/admin/exams/${exam.id}`, {
                          method: "DELETE",
                        });
                      }}
                      type="button"
                    >
                      删除
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {exams.length === 0 ? (
              <tr>
                <td
                  className="px-5 py-12 text-center text-sm font-semibold text-ink-600"
                  colSpan={7}
                >
                  暂无考试，先新建一个模拟考试。
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
