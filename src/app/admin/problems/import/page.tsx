import { requirePageUser } from "@/lib/auth";
import { ImportClient } from "./import-client";

export default async function AdminProblemImportPage() {
  await requirePageUser("admin");

  return (
    <>
      <ImportClient />
    </>
  );
}
