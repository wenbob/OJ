import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { requirePageUser } from "@/lib/auth";
import {
  applyAiProviderStatusesToSettings,
  getEffectiveAiProviderConfig,
  toAiProviderAdminStatus,
} from "@/lib/aiProvider";
import { getAllSystemSettings } from "@/lib/settings";
import { SettingsForm } from "./settings-form";

const adminNav = [
  { href: "/admin", label: "后台首页" },
  { href: "/admin/practice", label: "题目练习" },
  { href: "/admin/problems", label: "题目管理" },
  { href: "/admin/exams", label: "模拟考试" },
  { href: "/admin/users", label: "用户管理" },
  { href: "/admin/settings", label: "系统设置" },
  { href: "/admin/submissions", label: "日常提交" },
  { href: "/admin/exam-submissions", label: "考试提交" },
];

export default async function AdminSettingsPage() {
  const user = await requirePageUser("admin");
  const [storedSettings, programmingConfig, objectiveConfig] = await Promise.all([
    getAllSystemSettings(),
    getEffectiveAiProviderConfig("programming"),
    getEffectiveAiProviderConfig("objective"),
  ]);
  const aiProviderStatuses = {
    programming: toAiProviderAdminStatus(programmingConfig),
    objective: toAiProviderAdminStatus(objectiveConfig),
  };
  const settings = applyAiProviderStatusesToSettings(
    storedSettings,
    aiProviderStatuses,
  );

  return (
    <AppShell nav={adminNav} title="管理员端" user={user}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.16em] text-clay">
            System Settings
          </p>
          <h1 className="mt-2 text-2xl font-black">系统设置</h1>
          <p className="mt-2 text-sm font-semibold text-ink-600">
            配置平台、评测默认值，以及服务端 AI 密钥、模型和思考模式。
          </p>
        </div>
        <Link className="btn btn-secondary" href="/admin">
          返回后台首页
        </Link>
      </div>
      <SettingsForm
        initialAiProviderStatuses={aiProviderStatuses}
        initialSettings={settings}
      />
    </AppShell>
  );
}
