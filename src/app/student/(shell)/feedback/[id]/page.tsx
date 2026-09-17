import { FeedbackDetailPage } from "@/components/feedback/FeedbackPages";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return <FeedbackDetailPage role="student" params={params} />;
}
