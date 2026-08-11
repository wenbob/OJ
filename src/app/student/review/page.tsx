import type { CSSProperties } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpenCheck,
  BrainCircuit,
  CheckCircle2,
  RotateCcw,
  Target,
  TriangleAlert,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { NavigationLink } from "@/components/NavigationLink";
import { Pagination } from "@/components/Pagination";
import { ProblemTypeBadge } from "@/components/ProblemTypeBadge";
import { StatusBadge } from "@/components/StatusBadge";
import { requirePageUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import {
  getStudentLearningReview,
  type LearningReviewStatus,
} from "@/lib/learningReview";
import { buildPaginationMeta, readPaginationFromObject } from "@/lib/pagination";

const studentNav = [
  { href: "/student", label: "首页" },
  { href: "/student/problems", label: "日常刷题" },
  { href: "/student/exams", label: "模拟考试" },
  { href: "/student/submissions", label: "日常提交" },
  { href: "/student/exam-submissions", label: "考试提交" },
];

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type ProgressStyle = CSSProperties & { "--progress": number };

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function readStatus(value: string | undefined): LearningReviewStatus | "all" {
  return value === "pending" || value === "conquered" ? value : "all";
}

function reviewHref({
  category,
  status,
}: {
  category?: string;
  status?: LearningReviewStatus | "all";
}) {
  const params = new URLSearchParams();
  if (status && status !== "all") params.set("status", status);
  if (category) params.set("category", category);
  const query = params.toString();
  return query ? `/student/review?${query}` : "/student/review";
}

export default async function StudentReviewPage({ searchParams }: PageProps) {
  const user = await requirePageUser("student");
  const query = await searchParams;
  const selectedStatus = readStatus(firstValue(query.status));
  const selectedCategory = firstValue(query.category)?.trim() || "";
  const review = await getStudentLearningReview(user.id);
  const { page: requestedPage, pageSize } = readPaginationFromObject(query);
  const categories = review.weakCategories.map((item) => item.category);
  const filteredEntries = review.entries.filter((entry) => {
    if (selectedStatus !== "all" && entry.status !== selectedStatus) return false;
    if (selectedCategory && entry.category !== selectedCategory) return false;
    return true;
  });
  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const skip = (page - 1) * pageSize;
  const visibleEntries = filteredEntries.slice(skip, skip + pageSize);
  const pagination = buildPaginationMeta({
    page,
    pageSize,
    total: filteredEntries.length,
  });

  return (
    <AppShell nav={studentNav} title="学生端" user={user}>
      <section className="surface overflow-hidden">
        <div className="grid lg:grid-cols-[1.15fr_0.85fr]">
          <div className="relative overflow-hidden p-6 md:p-9">
            <div className="absolute -right-16 -top-20 h-52 w-52 rounded-full border-[34px] border-clay/5" />
            <div className="relative">
              <p className="arena-kicker">Learning Review</p>
              <div className="arena-rule mt-3" />
              <h1 className="mt-5 text-3xl font-black tracking-tight text-ink-950 md:text-4xl">
                错题本与薄弱知识点
              </h1>
              <p className="mt-4 max-w-2xl text-sm font-semibold leading-7 text-ink-600 md:text-base">
                系统会合并日常刷题和模拟考试的历史提交。只要一道题曾经出错，就会进入错题本；后续通过后会自动标记为“已攻克”。
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link className="btn btn-primary" href={reviewHref({ status: "pending" })}>
                  <Target size={17} />
                  优先处理待攻克
                  <ArrowRight size={16} />
                </Link>
                <Link className="btn btn-secondary" href="/student/problems">
                  <BookOpenCheck size={17} />
                  继续挑战新题
                </Link>
              </div>
            </div>
          </div>

          <div className="scoreboard-strip grid grid-cols-2 content-center">
            <ReviewStat label="待攻克" value={review.summary.pendingProblemCount} />
            <ReviewStat label="已攻克" value={review.summary.conqueredProblemCount} />
            <ReviewStat label="曾经出错" value={review.summary.mistakeProblemCount} />
            <ReviewStat label="薄弱分类" value={review.summary.weakCategoryCount} />
          </div>
        </div>
      </section>

      <section className="mt-7" aria-labelledby="weak-category-heading">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="arena-kicker">Weak Knowledge</p>
            <h2 className="mt-1 text-2xl font-black text-ink-950" id="weak-category-heading">
              薄弱知识点
            </h2>
          </div>
          <p className="text-xs font-bold text-ink-600">
            掌握率 = 已通过题数 ÷ 已尝试题数
          </p>
        </div>

        {review.weakCategories.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {review.weakCategories.map((category, index) => (
              <Link
                className={`arena-link-card surface block min-w-0 p-4 ${
                  selectedCategory === category.category
                    ? "border-steel bg-steel/5 ring-1 ring-steel/20"
                    : ""
                }`}
                href={reviewHref({ category: category.category, status: selectedStatus })}
                key={category.category}
                scroll={false}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-clay">
                    Weak Point {String(index + 1).padStart(2, "0")}
                  </p>
                  <span className="data-number text-xl font-black text-steel">
                    {category.masteryPercent}%
                  </span>
                </div>
                <h3 className="mt-1 truncate text-base font-black text-ink-950" title={category.category}>
                  {category.category}
                </h3>
                <div className="mt-3 h-2 overflow-hidden border border-ink-950/10 bg-ink-950/5 p-px">
                  <div
                    className="progress-fill h-full bg-steel"
                    style={{ "--progress": category.masteryPercent / 100 } as ProgressStyle}
                  />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] font-bold text-ink-600">
                  <span>通过 {category.acceptedProblemCount}/{category.attemptedProblemCount}</span>
                  <span>待攻克 {category.pendingProblemCount} 题</span>
                  <span className="col-span-2">失败尝试 {category.failedAttemptCount} 次</span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="surface flex items-center gap-4 p-6 text-sm font-semibold text-ink-600">
            <CheckCircle2 className="flex-none text-moss" size={24} />
            目前还没有薄弱知识点。继续完成新题，这里会随历史提交自动更新。
          </div>
        )}
      </section>

      <section className="surface mt-7 overflow-hidden" aria-labelledby="review-list-heading">
        <div className="border-b border-ink-950/10 p-5 md:p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="arena-kicker">Mistake Book</p>
              <h2 className="mt-1 text-2xl font-black text-ink-950" id="review-list-heading">
                错题清单
              </h2>
            </div>
            <p className="text-sm font-bold text-ink-600">
              已尝试 {review.summary.attemptedProblemCount} 题 · 失败尝试 {review.summary.totalFailedAttemptCount} 次
            </p>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <FilterLink
              active={selectedStatus === "all"}
              href={reviewHref({ category: selectedCategory, status: "all" })}
            >
              全部错题
            </FilterLink>
            <FilterLink
              active={selectedStatus === "pending"}
              href={reviewHref({ category: selectedCategory, status: "pending" })}
            >
              待攻克
            </FilterLink>
            <FilterLink
              active={selectedStatus === "conquered"}
              href={reviewHref({ category: selectedCategory, status: "conquered" })}
            >
              已攻克
            </FilterLink>
          </div>

          {categories.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <FilterLink
                active={!selectedCategory}
                href={reviewHref({ status: selectedStatus })}
              >
                全部分类
              </FilterLink>
              {categories.map((category) => (
                <FilterLink
                  active={selectedCategory === category}
                  href={reviewHref({ category, status: selectedStatus })}
                  key={category}
                >
                  {category}
                </FilterLink>
              ))}
            </div>
          ) : null}
        </div>

        {visibleEntries.length > 0 ? (
          <div className="grid gap-3 p-4 md:p-5 lg:grid-cols-2">
            {visibleEntries.map((entry) => {
              const continueHref = entry.resumeSubmissionId
                ? `/student/problems/${entry.problemId}?fromSubmission=${entry.resumeSubmissionId}`
                : `/student/problems/${entry.problemId}`;
              return (
                <article className="flex flex-col border border-ink-950/10 bg-white/65 p-4" key={entry.problemId}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <ReviewStatus status={entry.status} />
                        <ProblemTypeBadge type={entry.problemType} />
                      </div>
                      <h3 className="mt-2 text-lg font-black text-ink-950">{entry.title}</h3>
                      <p className="mt-0.5 text-xs font-bold text-ink-600">
                        {entry.category} · {entry.difficulty}
                      </p>
                    </div>
                    {entry.status === "pending" ? (
                      <TriangleAlert className="text-clay" size={21} />
                    ) : (
                      <CheckCircle2 className="text-moss" size={21} />
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-ink-950/10 py-3 text-xs font-bold text-ink-600">
                    <span>
                      总尝试 <strong className="data-number ml-1 text-sm text-ink-950">{entry.attemptCount}</strong> 次
                    </span>
                    <span>
                      失败 <strong className="data-number ml-1 text-sm text-clay">{entry.failedAttemptCount}</strong> 次
                    </span>
                    <span className="flex items-center gap-2">
                      最近结果 <StatusBadge status={entry.latestStatus} />
                    </span>
                    <span className="lg:ml-auto">{formatDate(entry.latestSubmittedAt)}</span>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link className="btn btn-primary min-h-0 px-3 py-2 text-xs" href={continueHref}>
                      <RotateCcw size={16} />
                      {entry.resumeSubmissionId ? "加载最近代码继续" : "重新挑战"}
                    </Link>
                    <Link
                      className="btn btn-secondary min-h-0 px-3 py-2 text-xs"
                      href={`/student/submissions/${entry.latestSubmissionId}`}
                    >
                      查看最近提交
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <BrainCircuit className="text-steel" size={38} />
            <h3 className="mt-4 text-xl font-black text-ink-950">
              {review.entries.length === 0 ? "暂时没有错题" : "该筛选下没有题目"}
            </h3>
            <p className="mt-2 max-w-xl text-sm font-semibold leading-6 text-ink-600">
              {review.entries.length === 0
                ? "首次就 Accepted 的题不会进入错题本。继续挑战新题，遇到问题时再回来集中复盘。"
                : "可以切换状态或分类，查看其他错题。"}
            </p>
            <Link className="btn btn-primary mt-5" href="/student/problems">
              去挑战新题
            </Link>
          </div>
        )}

        <Pagination
          basePath="/student/review"
          page={pagination.page}
          pageSize={pagination.pageSize}
          searchParams={query}
          total={pagination.total}
          totalPages={pagination.totalPages}
        />
      </section>
    </AppShell>
  );
}

function ReviewStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-b border-r border-white/10 p-5 md:p-6">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-[#bdb5a7]">{label}</p>
      <p className="data-number mt-2 text-3xl font-black text-[#f2d28c]">{value}</p>
    </div>
  );
}

function ReviewStatus({ status }: { status: LearningReviewStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1 border px-2 py-1 text-xs font-black ${
        status === "pending"
          ? "border-clay/30 bg-clay/10 text-clay"
          : "border-moss/30 bg-moss/10 text-moss"
      }`}
    >
      {status === "pending" ? "待攻克" : "已攻克"}
    </span>
  );
}

function FilterLink({
  active,
  children,
  href,
}: {
  active: boolean;
  children: React.ReactNode;
  href: string;
}) {
  return (
    <NavigationLink
      className={`border px-3 py-2 text-sm font-black ${
        active
          ? "border-ink-950 bg-ink-950 text-white"
          : "border-ink-950/10 bg-white/65 text-ink-800 hover:border-steel hover:text-steel"
      }`}
      href={href}
      pendingLabel="正在筛选错题"
      scroll={false}
    >
      {children}
    </NavigationLink>
  );
}
