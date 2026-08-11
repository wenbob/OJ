import Link from "next/link";
import { requirePageUser } from "@/lib/auth";
import {
  applyAiProviderStatusesToSettings,
  getEffectiveAiProviderConfig,
  toAiProviderAdminStatus,
} from "@/lib/aiProvider";
import { getAllSystemSettings } from "@/lib/settings";
import { getSystemSettingsRevision } from "@/lib/systemSettingsRevision";
import { SettingsForm } from "./settings-form";

export default async function AdminSettingsPage() {
  await requirePageUser("admin");
  const [storedSettings, revision, programmingConfig, objectiveConfig] = await Promise.all([
    getAllSystemSettings(),
    getSystemSettingsRevision(),
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
    <>
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
        initialRevision={revision}
        initialSettings={settings}
      />
    </>
  );
}
