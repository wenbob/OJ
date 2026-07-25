import type { Prisma } from "@prisma/client";

export type AdminSubmissionFilters = {
  examId?: number;
  username?: string;
  role?: "student" | "teacher" | "admin";
  problemId?: number;
  status?: string;
  startDate?: string;
  endDate?: string;
};

function cleanText(value: string | null | undefined) {
  const nextValue = value?.trim();
  return nextValue ? nextValue : undefined;
}

function readFirst(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseProblemId(value: string | null | undefined) {
  const problemId = Number(value);
  return Number.isInteger(problemId) && problemId > 0 ? problemId : undefined;
}

function parseExamId(value: string | null | undefined) {
  const examId = Number(value);
  return Number.isInteger(examId) && examId > 0 ? examId : undefined;
}

function parseRole(value: string | null | undefined) {
  return value === "student" || value === "teacher" || value === "admin"
    ? value
    : undefined;
}

function safeDate(value: string | undefined, endOfDay = false) {
  if (!value) return undefined;
  const suffix = endOfDay ? "T23:59:59.999" : "T00:00:00.000";
  const date = new Date(`${value}${suffix}`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function readAdminSubmissionFiltersFromUrl(
  searchParams: URLSearchParams,
): AdminSubmissionFilters {
  return {
    examId: parseExamId(searchParams.get("examId")),
    username: cleanText(searchParams.get("username")),
    role: parseRole(searchParams.get("role")),
    problemId: parseProblemId(searchParams.get("problemId")),
    status: cleanText(searchParams.get("status")),
    startDate: cleanText(searchParams.get("startDate")),
    endDate: cleanText(searchParams.get("endDate")),
  };
}

export function readAdminSubmissionFiltersFromObject(
  searchParams: Record<string, string | string[] | undefined>,
): AdminSubmissionFilters {
  return {
    examId: parseExamId(readFirst(searchParams.examId)),
    username: cleanText(readFirst(searchParams.username)),
    role: parseRole(readFirst(searchParams.role)),
    problemId: parseProblemId(readFirst(searchParams.problemId)),
    status: cleanText(readFirst(searchParams.status)),
    startDate: cleanText(readFirst(searchParams.startDate)),
    endDate: cleanText(readFirst(searchParams.endDate)),
  };
}

export function buildAdminSubmissionWhere(filters: AdminSubmissionFilters) {
  const where: Prisma.SubmissionWhereInput = {};

  if (filters.username || filters.role) {
    where.user = {
      ...(filters.username
        ? { username: { contains: filters.username } }
        : {}),
      ...(filters.role ? { role: filters.role } : {}),
    };
  }

  if (filters.problemId) {
    where.problemId = filters.problemId;
  }

  if (filters.examId) {
    where.examId = filters.examId;
  }

  if (filters.status) {
    where.status = filters.status;
  }

  const gte = safeDate(filters.startDate);
  const lte = safeDate(filters.endDate, true);
  if (gte || lte) {
    where.createdAt = {
      ...(gte ? { gte } : {}),
      ...(lte ? { lte } : {}),
    };
  }

  return where;
}
