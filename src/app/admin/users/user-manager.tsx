"use client";

import {
  Eye,
  EyeOff,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { formatDate } from "@/lib/format";
import type { StaffRole } from "@/lib/staffAccess";

type UserItem = {
  aiAccessEnabled?: boolean;
  customTitle?: string | null;
  id: number;
  ranking?: {
    acCount: number;
    acceptedSubmissionCount: number;
    displayTitle: string;
    points: number;
    rank: number;
    tierTitle: string;
  } | null;
  username: string;
  role: string;
  createdAt: string;
  studentProfile?: {
    aiAccessEnabled: boolean;
    customTitle: string | null;
  } | null;
  submissions?: number;
  _count?: { submissions: number };
};

const blankForm = {
  aiAccessEnabled: false,
  customTitle: "",
  username: "",
  password: "",
  passwordConfirm: "",
  role: "student",
};

export function UserManager({
  initialUsers,
  viewerRole,
}: {
  initialUsers: UserItem[];
  viewerRole: StaffRole;
}) {
  const [users, setUsers] = useState(initialUsers);
  const [form, setForm] = useState(blankForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [stickyTop, setStickyTop] = useState(16);
  const formPanelRef = useRef<HTMLFormElement>(null);
  const usernameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const panel = formPanelRef.current;
    if (!panel) return;
    const desktopQuery = window.matchMedia("(min-width: 1024px)");

    const updateStickyTop = () => {
      if (!desktopQuery.matches) {
        setStickyTop(16);
        return;
      }
      const viewportHeight =
        window.visualViewport?.height ?? window.innerHeight;
      const availableHeight = Math.max(320, viewportHeight - 32);
      const panelHeight = Math.min(panel.scrollHeight, availableHeight);
      setStickyTop(Math.max(16, Math.round((viewportHeight - panelHeight) / 2)));
    };

    const observer = new ResizeObserver(updateStickyTop);
    observer.observe(panel);
    desktopQuery.addEventListener("change", updateStickyTop);
    window.addEventListener("resize", updateStickyTop);
    window.visualViewport?.addEventListener("resize", updateStickyTop);
    updateStickyTop();

    return () => {
      observer.disconnect();
      desktopQuery.removeEventListener("change", updateStickyTop);
      window.removeEventListener("resize", updateStickyTop);
      window.visualViewport?.removeEventListener("resize", updateStickyTop);
    };
  }, []);

  async function reload() {
    const response = await fetch("/api/admin/users");
    const data = await response.json();
    if (response.ok) {
      setUsers(
        data.users.map((item: UserItem) => ({
          ...item,
          aiAccessEnabled:
            item.aiAccessEnabled ?? item.studentProfile?.aiAccessEnabled ?? false,
          customTitle: item.customTitle ?? item.studentProfile?.customTitle ?? "",
          submissions: item.submissions ?? item._count?.submissions ?? 0,
        })),
      );
    }
  }

  function editUser(user: UserItem) {
    setEditingId(user.id);
    setForm({
      aiAccessEnabled: user.aiAccessEnabled ?? false,
      customTitle: user.customTitle ?? "",
      username: user.username,
      password: "",
      passwordConfirm: "",
      role: user.role,
    });
    setShowPassword(false);
    setError("");
    window.requestAnimationFrame(() => {
      formPanelRef.current?.scrollTo({ top: 0 });
      usernameInputRef.current?.focus({ preventScroll: true });
    });
  }

  function resetForm() {
    setEditingId(null);
    setForm(blankForm);
    setShowPassword(false);
    setError("");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.username.trim()) {
      setError("用户名不能为空");
      return;
    }
    if (!editingId && !form.password) {
      setError("新增用户时密码不能为空");
      return;
    }
    if (form.password && form.password.length < 8) {
      setError("密码至少需要 8 位");
      return;
    }
    if (form.password !== form.passwordConfirm) {
      setError("两次输入的密码不一致");
      return;
    }
    if (form.customTitle.trim().length > 20) {
      setError("自定义头衔不能超过 20 个字符");
      return;
    }
    setPending(true);
    setError("");
    const payload = {
      aiAccessEnabled: form.aiAccessEnabled,
      customTitle: form.customTitle,
      password: form.password,
      role: form.role,
      username: form.username,
    };

    const response = await fetch(
      editingId ? `/api/admin/users/${editingId}` : "/api/admin/users",
      {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const data = await response.json();
    setPending(false);

    if (!response.ok) {
      setError(data.error ?? "保存失败");
      return;
    }

    resetForm();
    await reload();
  }

  async function deleteUser(user: UserItem) {
    if (!confirm(`确定要删除用户 ${user.username} 吗？该操作无法恢复。`)) return;
    const response = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error ?? "删除失败");
      return;
    }
    await reload();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
      <section className="surface overflow-hidden">
        <div className="border-b border-ink-950/10 p-5">
          <h1 className="text-2xl font-black">
            {viewerRole === "admin" ? "用户管理" : "学生管理"}
          </h1>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse">
            <thead>
              <tr className="border-b border-ink-950/10 bg-white/55 text-left">
                <th className="table-head px-5 py-3">用户名</th>
                <th className="table-head px-5 py-3">角色</th>
                <th className="table-head px-5 py-3">AI 权限</th>
                <th className="table-head px-5 py-3">头衔</th>
                <th className="table-head px-5 py-3">段位积分</th>
                <th className="table-head px-5 py-3">提交</th>
                <th className="table-head px-5 py-3">创建时间</th>
                <th className="table-head px-5 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr className="border-b border-ink-950/10" key={user.id}>
                  <td className="px-5 py-4 font-black">{user.username}</td>
                  <td className="px-5 py-4 text-sm font-semibold text-ink-700">
                    {user.role}
                  </td>
                  <td className="px-5 py-4 text-sm font-bold">
                    {user.role === "student" ? (
                      <span
                        className={`inline-flex border px-2 py-1 text-xs font-black ${
                          user.aiAccessEnabled
                            ? "border-moss/30 bg-moss/10 text-moss"
                            : "border-ink-950/10 bg-white/60 text-ink-500"
                        }`}
                      >
                        {user.aiAccessEnabled ? "已开通" : "未开通"}
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-5 py-4 text-sm font-semibold text-ink-700">
                    {user.ranking ? (
                      <span>
                        {user.ranking.displayTitle}
                        {user.customTitle ? (
                          <span className="ml-2 text-ink-500">自定义</span>
                        ) : null}
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-5 py-4 text-sm font-semibold text-ink-700">
                    {user.ranking ? (
                      <div>
                        <p className="font-black text-ink-950">
                          {user.ranking.tierTitle} · {user.ranking.points} 分
                        </p>
                        <p className="mt-1 text-xs text-ink-600">
                          唯一 AC {user.ranking.acCount} 题 · AC {user.ranking.acceptedSubmissionCount} 次
                        </p>
                      </div>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-5 py-4 text-sm font-semibold text-ink-700">
                    {user.submissions ?? 0}
                  </td>
                  <td className="px-5 py-4 text-sm font-semibold text-ink-700">
                    {formatDate(user.createdAt)}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex justify-end gap-2">
                      <button className="btn btn-secondary px-3 py-2" onClick={() => editUser(user)} type="button">
                        <Pencil size={15} />
                        编辑
                      </button>
                      <button className="btn btn-danger px-3 py-2" onClick={() => deleteUser(user)} type="button">
                        <Trash2 size={15} />
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <form
        className="surface p-5 lg:sticky lg:max-h-[calc(100dvh-2rem)] lg:self-start lg:overflow-y-auto"
        onSubmit={save}
        ref={formPanelRef}
        style={{ top: stickyTop }}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-black">{editingId ? "编辑用户" : "新增用户"}</h2>
          {editingId ? (
            <button className="btn btn-secondary px-3 py-2" onClick={resetForm} type="button">
              <X size={15} />
              取消
            </button>
          ) : null}
        </div>
        <div className="mt-5 grid gap-4">
          <label className="grid gap-2 text-sm font-bold text-ink-800">
            用户名
            <input
              className="field"
              ref={usernameInputRef}
              value={form.username}
              onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
            />
          </label>
          <label className="grid gap-2 text-sm font-bold text-ink-800">
            {editingId ? "设置新密码（留空则不修改）" : "密码"}
            <span className="relative">
              <input
                className="field w-full pr-12"
                minLength={8}
                placeholder={editingId ? "留空则保持原密码" : "至少 8 位"}
                type={showPassword ? "text" : "password"}
                value={form.password}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    password: event.target.value,
                  }))
                }
              />
              <button
                aria-label={showPassword ? "隐藏新密码" : "显示新密码"}
                aria-pressed={showPassword}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-500 hover:text-steel"
                onClick={() => setShowPassword((current) => !current)}
                type="button"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </span>
            {editingId ? (
              <span className="text-xs font-semibold leading-5 text-ink-600">
                原密码已安全加密，系统无法查看；留空不会修改密码。
              </span>
            ) : null}
          </label>
          {!editingId || form.password ? (
            <label className="grid gap-2 text-sm font-bold text-ink-800">
              确认新密码
              <input
                className="field"
                minLength={8}
                placeholder="再次输入相同密码"
                type={showPassword ? "text" : "password"}
                value={form.passwordConfirm}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    passwordConfirm: event.target.value,
                  }))
                }
              />
            </label>
          ) : null}
          <label className="grid gap-2 text-sm font-bold text-ink-800">
            角色
            <select
              className="field"
              value={form.role}
              onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))}
            >
              <option value="student">student</option>
              {viewerRole === "admin" ? (
                <>
                  <option value="teacher">teacher</option>
                  <option value="admin">admin</option>
                </>
              ) : null}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-bold text-ink-800">
            自定义头衔（仅学生，最多 20 字）
            <input
              className="field"
              maxLength={20}
              placeholder="留空则使用自动段位名"
              value={form.customTitle}
              onChange={(event) => setForm((current) => ({ ...current, customTitle: event.target.value }))}
            />
            <span className="text-xs font-semibold text-ink-600">
              留空使用自动段位名；自定义头衔只影响展示，不影响积分和排名。
            </span>
          </label>
          <label className="flex items-start gap-3 border border-indigo-200 bg-indigo-50/70 p-4 text-sm font-bold text-indigo-950">
            <input
              checked={form.aiAccessEnabled}
              className="mt-0.5 h-4 w-4 accent-indigo-700"
              disabled={form.role !== "student"}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  aiAccessEnabled: event.target.checked,
                }))
              }
              type="checkbox"
            />
            <span>
              开通 AI 对话权限
              <span className="mt-1 block text-xs font-semibold leading-5 text-indigo-800">
                仍需同时开启日常练习 AI 总开关或当前考试 AI 开关。
              </span>
            </span>
          </label>
        </div>
        {error ? (
          <p className="mt-4 border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
            {error}
          </p>
        ) : null}
        <button className="btn btn-primary mt-5 w-full" disabled={pending} type="submit">
          {editingId ? <Save size={16} /> : <Plus size={16} />}
          {pending ? "保存中" : "保存用户"}
        </button>
      </form>
    </div>
  );
}
