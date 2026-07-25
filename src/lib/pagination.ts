export const DEFAULT_PAGE_SIZE = 20;
export const PROBLEM_LIST_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

export type PaginationMeta = {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

function firstValue(value: string | string[] | undefined | null) {
  return Array.isArray(value) ? value[0] : value;
}

function readNumber(value: string | string[] | undefined | null) {
  const parsed = Number(firstValue(value));
  return Number.isInteger(parsed) ? parsed : undefined;
}

export function readPaginationFromObject(
  searchParams: Record<string, string | string[] | undefined>,
  defaultPageSize = DEFAULT_PAGE_SIZE,
) {
  const page = Math.max(1, readNumber(searchParams.page) ?? 1);
  const normalizedDefaultPageSize = Number.isInteger(defaultPageSize)
    ? Math.min(Math.max(1, defaultPageSize), MAX_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE;
  const rawPageSize =
    readNumber(searchParams.pageSize) ?? normalizedDefaultPageSize;
  const pageSize = Math.min(Math.max(1, rawPageSize), MAX_PAGE_SIZE);
  return { page, pageSize, skip: (page - 1) * pageSize };
}

export function readPaginationFromUrl(
  searchParams: URLSearchParams,
  defaultPageSize = DEFAULT_PAGE_SIZE,
) {
  return readPaginationFromObject(
    {
      page: searchParams.get("page") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
    },
    defaultPageSize,
  );
}

export function buildPaginationMeta({
  page,
  pageSize,
  total,
}: {
  page: number;
  pageSize: number;
  total: number;
}): PaginationMeta {
  return {
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
