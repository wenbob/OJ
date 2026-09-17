import { FeedbackListPage, type FeedbackSearchParams } from "@/components/feedback/FeedbackPages";

export default function Page({ searchParams }: { searchParams: Promise<FeedbackSearchParams> }) {
  return <FeedbackListPage role="student" searchParams={searchParams} />;
}
