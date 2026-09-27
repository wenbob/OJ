import { AnnouncementDetailPage } from "@/components/AnnouncementsPage";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <AnnouncementDetailPage role="student" id={(await params).id} />;
}
