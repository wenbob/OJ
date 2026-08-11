import { AppShell } from "@/components/AppShell";
import {
  getStaffNav,
  getStaffTitle,
  requireStaffPageUser,
} from "@/lib/staffAccess";

export default async function TeacherLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireStaffPageUser("teacher");

  return (
    <AppShell nav={getStaffNav("teacher")} title={getStaffTitle("teacher")} user={user}>
      {children}
    </AppShell>
  );
}
