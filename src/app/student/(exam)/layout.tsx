import { AppShell } from "@/components/AppShell";
import { requirePageUser } from "@/lib/auth";

export default async function StudentExamLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requirePageUser("student");

  return (
    <AppShell locked nav={[]} title="考试答题" user={user}>
      {children}
    </AppShell>
  );
}
