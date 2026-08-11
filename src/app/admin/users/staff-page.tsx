// Shared server page for administrator and teacher shells.
import { AppShell } from "@/components/AppShell";
import { boolSetting, getSetting } from "@/lib/settings";
import { getStaffUserPage } from "@/lib/staffUserDirectory";
import {
  getStaffNav,
  getStaffTitle,
  requireStaffPageUser,
  type StaffRole,
} from "@/lib/staffAccess";
import { UserManager } from "./user-manager";

export async function StaffUsersPage({ role }: { role: StaffRole }) {
  const user = await requireStaffPageUser(role);
  const [directory, objectiveMaster, objectiveStudent] = await Promise.all([
    getStaffUserPage({ viewerRole: role }),
    getSetting("aiObjectiveExplanationEnabled"),
    getSetting("aiStudentObjectiveExplanationEnabled"),
  ]);

  return (
    <AppShell nav={getStaffNav(role)} title={getStaffTitle(role)} user={user}>
      <UserManager
        initialPagination={directory}
        initialUsers={directory.users}
        initialStudentObjectiveAiGloballyEnabled={
          boolSetting(objectiveMaster) && boolSetting(objectiveStudent)
        }
        viewerRole={role}
      />
    </AppShell>
  );
}

export default function AdminUsersPage() {
  return <StaffUsersPage role="admin" />;
}
