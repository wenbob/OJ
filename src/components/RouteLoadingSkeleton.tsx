"use client";

import { usePathname } from "next/navigation";

export function RouteLoadingSkeleton() {
  const pathname = usePathname();
  const isDualColumn =
    /\/problems\/\d+(?:\/|$)/.test(pathname) ||
    /\/exams\/\d+\/(?:take|practice)(?:\/|$)/.test(pathname);
  const isTable =
    /\/(?:problems|practice|submissions|exam-submissions|leaderboard|exams)(?:\/|$)/.test(
      pathname,
    );

  return (
    <div
      aria-busy="true"
      aria-label="页面内容加载中"
      className="route-loading-skeleton"
      data-route-loading
      role="status"
    >
      {isDualColumn ? (
        <DualColumnSkeleton />
      ) : isTable ? (
        <TableSkeleton />
      ) : (
        <DashboardSkeleton />
      )}
      <span className="sr-only">页面内容加载中</span>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="grid gap-6">
      <div className="surface grid gap-5 p-6 md:grid-cols-[1.4fr_0.6fr]">
        <div className="grid gap-3">
          <SkeletonLine width="w-28" />
          <SkeletonLine height="h-9" width="w-72 max-w-full" />
          <SkeletonLine width="w-full" />
          <SkeletonLine width="w-4/5" />
        </div>
        <SkeletonBlock className="min-h-32" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <SkeletonBlock className="h-28" key={index} />
        ))}
      </div>
    </div>
  );
}

function TableSkeleton() {
  return (
    <section className="surface overflow-hidden">
      <div className="grid gap-3 border-b border-ink-950/10 p-5">
        <SkeletonLine width="w-28" />
        <SkeletonLine height="h-8" width="w-56 max-w-full" />
        <div className="mt-2 flex flex-wrap gap-2">
          {Array.from({ length: 5 }, (_, index) => (
            <SkeletonBlock className="h-10 w-24" key={index} />
          ))}
        </div>
      </div>
      <div className="divide-y divide-ink-950/10">
        {Array.from({ length: 6 }, (_, index) => (
          <div
            className="grid min-h-16 grid-cols-[minmax(0,2fr)_repeat(3,minmax(80px,1fr))] items-center gap-5 px-5 py-4"
            key={index}
          >
            <SkeletonLine width="w-4/5" />
            <SkeletonLine width="w-2/3" />
            <SkeletonLine width="w-3/4" />
            <SkeletonLine width="w-1/2" />
          </div>
        ))}
      </div>
    </section>
  );
}

function DualColumnSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(340px,0.78fr)]">
      <section className="surface grid gap-4 p-6">
        <SkeletonLine width="w-32" />
        <SkeletonLine height="h-9" width="w-3/4" />
        <SkeletonLine width="w-full" />
        <SkeletonLine width="w-11/12" />
        <SkeletonBlock className="mt-2 h-52" />
      </section>
      <aside className="surface grid content-start gap-4 p-6">
        <SkeletonLine height="h-7" width="w-2/3" />
        <SkeletonBlock className="h-72" />
        <SkeletonBlock className="h-12" />
      </aside>
    </div>
  );
}

function SkeletonLine({
  height = "h-4",
  width,
}: {
  height?: string;
  width: string;
}) {
  return <span aria-hidden="true" className={`skeleton-shimmer block ${height} ${width}`} />;
}

function SkeletonBlock({ className }: { className: string }) {
  return <span aria-hidden="true" className={`skeleton-shimmer block ${className}`} />;
}
