import { NavigationLink } from "@/components/NavigationLink";

type SearchValue = string | string[] | undefined;

export function Pagination({
  basePath,
  page,
  pageSize,
  searchParams,
  total,
  totalPages,
}: {
  basePath: string;
  page: number;
  pageSize: number;
  searchParams?: Record<string, SearchValue>;
  total: number;
  totalPages: number;
}) {
  const previousPage = Math.max(1, page - 1);
  const nextPage = Math.min(totalPages, page + 1);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-950/10 p-5 text-sm font-semibold text-ink-700">
      <span>
        共 {total} 条，每页 {pageSize} 条，第 {page} / {totalPages} 页
      </span>
      <div className="flex gap-2">
        {page <= 1 ? (
          <span className="btn btn-secondary pointer-events-none px-3 py-2 opacity-50">
            上一页
          </span>
        ) : (
          <NavigationLink
            className="btn btn-secondary px-3 py-2"
            href={pageHref(basePath, searchParams, previousPage, pageSize)}
            pendingLabel="正在加载上一页"
          >
            上一页
          </NavigationLink>
        )}
        {page >= totalPages ? (
          <span className="btn btn-secondary pointer-events-none px-3 py-2 opacity-50">
            下一页
          </span>
        ) : (
          <NavigationLink
            className="btn btn-secondary px-3 py-2"
            href={pageHref(basePath, searchParams, nextPage, pageSize)}
            pendingLabel="正在加载下一页"
          >
            下一页
          </NavigationLink>
        )}
      </div>
    </div>
  );
}

function pageHref(
  basePath: string,
  searchParams: Record<string, SearchValue> | undefined,
  page: number,
  pageSize: number,
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (key === "page" || key === "pageSize") continue;
    const first = Array.isArray(value) ? value[0] : value;
    if (first) params.set(key, first);
  }
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}
