// Shared server page for administrator and teacher shells.
import { boolSetting, getSetting } from "@/lib/settings";
import { getStaffUserPage } from "@/lib/staffUserDirectory";
import {
  requireStaffPageUser,
  type StaffRole,
} from "@/lib/staffAccess";
import { UserManager } from "./user-manager";

export async function StaffUsersPage({ role }: { role: StaffRole }) {
  await requireStaffPageUser(role);
  const [directory, objectiveMaster, objectiveStudent] = await Promise.all([
    getStaffUserPage({ viewerRole: role }),
    getSetting("aiObjectiveExplanationEnabled"),
    getSetting("aiStudentObjectiveExplanationEnabled"),
  ]);

  return (
    <>
      <UserManager
        initialPagination={directory}
        initialUsers={directory.users}
        initialStudentObjectiveAiGloballyEnabled={
          boolSetting(objectiveMaster) && boolSetting(objectiveStudent)
        }
        viewerRole={role}
      />
    </>
  );
}

export default function AdminUsersPage() {
  return <StaffUsersPage role="admin" />;
}
