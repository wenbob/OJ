import { AppShell } from "@/components/AppShell";
import { requirePageUser } from "@/lib/auth";

const studentNav = [
  { href: "/student", label: "首页" },
  { href: "/student/problems", label: "日常刷题" },
  { href: "/student/exams", label: "模拟考试" },
  { href: "/student/submissions", label: "日常提交" },
  { href: "/student/exam-submissions", label: "考试提交" },
];

export default async function StudentShellLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requirePageUser("student");

  return (
    <AppShell nav={studentNav} title="学生端" user={user}>
      {children}
    </AppShell>
  );
}
