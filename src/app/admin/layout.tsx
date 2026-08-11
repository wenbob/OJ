import { AppShell } from "@/components/AppShell";
import {
  getStaffNav,
  getStaffTitle,
  requireStaffPageUser,
} from "@/lib/staffAccess";

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireStaffPageUser("admin");

  return (
    <AppShell nav={getStaffNav("admin")} title={getStaffTitle("admin")} user={user}>
      {children}
    </AppShell>
  );
}
