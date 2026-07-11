import { redirect } from "next/navigation";
import { getCurrentUser, roleHome } from "@/lib/auth";
import { getPublicSettings } from "@/lib/settings";
import { LoginForm } from "./login-form";
import { BookOpenCheck, Code2, ShieldCheck, Trophy } from "lucide-react";

export default async function LoginPage() {
  const [user, settings] = await Promise.all([
    getCurrentUser(),
    getPublicSettings(),
  ]);
  if (user) redirect(roleHome(user.role));

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full border-[52px] border-clay/5" />
      <div className="absolute -bottom-40 -right-28 h-[30rem] w-[30rem] rounded-full border-[64px] border-steel/5" />
      <section className="relative grid w-full max-w-6xl overflow-hidden border border-ink-950/12 bg-[#fffdf7] shadow-[0_28px_80px_rgba(50,42,29,0.14)] md:grid-cols-[1.08fr_0.92fr]">
        <div className="relative overflow-hidden bg-ink-950 p-8 text-linen md:p-12 lg:p-14">
          <div className="absolute -right-14 top-10 h-44 w-44 rounded-full border-[25px] border-white/5" />
          <div className="relative">
            <span className="arena-brand-mark">
              <Code2 size={21} />
            </span>
            <p className="arena-kicker mt-8 text-[#d7a062]">{settings.siteName}</p>
            <h1 className="mt-4 max-w-xl text-4xl font-black leading-tight tracking-tight md:text-5xl lg:text-6xl">
              {settings.siteSubtitle}
            </h1>
            <p className="mt-5 max-w-lg text-sm font-semibold leading-6 text-[#d7d0c2]">
              从一道题开始训练，在每一次独立思考和 Accepted 中积累真正的进步。
            </p>
            <div className="mt-10 grid gap-3 sm:grid-cols-3 md:grid-cols-1 lg:grid-cols-3">
              <LoginFeature icon={<BookOpenCheck size={18} />} label="日常训练" />
              <LoginFeature icon={<Trophy size={18} />} label="段位天梯" />
              <LoginFeature icon={<ShieldCheck size={18} />} label="考试挑战" />
            </div>
          </div>
        </div>
        <div className="flex flex-col justify-center p-7 md:p-10 lg:p-14">
          <p className="arena-kicker">Welcome Back</p>
          <div className="arena-rule mt-3" />
          <h2 className="mt-6 text-3xl font-black text-ink-950">登录竞技学院</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-ink-600">
            使用老师发放的账号进入学生端或管理员端。
          </p>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}

function LoginFeature({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 border border-white/10 bg-white/5 px-3 py-3 text-sm font-black text-[#f4ead8]">
      <span className="text-[#d6a44a]">{icon}</span>
      {label}
    </div>
  );
}
