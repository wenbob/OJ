export const ASSIGNMENT_REMINDER_INTERVAL_MS = 60 * 60 * 1000;
export const STUDENT_ASSIGNMENT_REMINDER_STORAGE_PREFIX =
  "oj:student:assignment-reminder:v2";
export const STUDENT_ASSIGNMENT_REMINDER_STORAGE_EVENT =
  "oj:student:assignment-reminder:changed";

export type PendingAssignmentReminderItem = {
  id: number;
  title: string;
  publisherLabel: string;
  completedCount: number;
  problemCount: number;
  dueAt: string | null;
  updatedAt: string;
};

export type AssignmentReminderAcknowledgement = {
  updatedAt: string;
  remindedAt: string;
};

export type AssignmentReminderAcknowledgements = Record<
  string,
  AssignmentReminderAcknowledgement
>;

export type AssignmentReminderStorage = Pick<
  Storage,
  "getItem" | "setItem"
>;

export function getStudentAssignmentReminderStorageKey(studentId: number) {
  return `${STUDENT_ASSIGNMENT_REMINDER_STORAGE_PREFIX}:${studentId}`;
}

export function hasIncompleteAssignmentProblems(
  problems: Array<{ completedAt: Date | null }>,
) {
  return (
    problems.length > 0 &&
    problems.some((problem) => problem.completedAt === null)
  );
}

export function getAssignmentPublisherLabel(
  createdBy: { role: string; username: string } | null,
) {
  if (createdBy?.role === "teacher") {
    return `老师：${createdBy.username}`;
  }
  if (createdBy?.role === "admin") {
    return `管理员：${createdBy.username}`;
  }
  return "老师发布";
}

export function parseAssignmentReminderAcknowledgements(
  raw: string | null,
): AssignmentReminderAcknowledgements {
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    const acknowledgements: AssignmentReminderAcknowledgements = {};
    for (const [key, value] of Object.entries(
      parsed as Record<string, unknown>,
    )) {
      const assignmentId = Number(key);
      const record =
        value && typeof value === "object" && !Array.isArray(value)
          ? (value as Record<string, unknown>)
          : null;
      if (
        Number.isInteger(assignmentId) &&
        assignmentId > 0 &&
        record &&
        isValidDateString(record.updatedAt) &&
        isValidDateString(record.remindedAt)
      ) {
        acknowledgements[String(assignmentId)] = {
          updatedAt: record.updatedAt,
          remindedAt: record.remindedAt,
        };
      }
    }
    return acknowledgements;
  } catch {
    return {};
  }
}

export function shouldShowAssignmentReminder(
  assignment: PendingAssignmentReminderItem,
  acknowledgement: AssignmentReminderAcknowledgement | undefined,
  nowMs: number,
  intervalMs = ASSIGNMENT_REMINDER_INTERVAL_MS,
) {
  if (!acknowledgement) return true;
  if (acknowledgement.updatedAt !== assignment.updatedAt) return true;

  const remindedAtMs = Date.parse(acknowledgement.remindedAt);
  if (!Number.isFinite(nowMs) || !Number.isFinite(remindedAtMs)) return true;
  if (remindedAtMs > nowMs) return true;

  return nowMs - remindedAtMs >= normalizeInterval(intervalMs);
}

export function getUnacknowledgedAssignmentReminders(
  assignments: PendingAssignmentReminderItem[],
  acknowledgements: AssignmentReminderAcknowledgements,
  nowMs: number,
  intervalMs = ASSIGNMENT_REMINDER_INTERVAL_MS,
) {
  return assignments.filter(
    (assignment) =>
      shouldShowAssignmentReminder(
        assignment,
        acknowledgements[String(assignment.id)],
        nowMs,
        intervalMs,
      ),
  );
}

export function getNextAssignmentReminderAt(
  assignments: PendingAssignmentReminderItem[],
  acknowledgements: AssignmentReminderAcknowledgements,
  nowMs: number,
  intervalMs = ASSIGNMENT_REMINDER_INTERVAL_MS,
) {
  if (assignments.length === 0) return null;

  const normalizedInterval = normalizeInterval(intervalMs);
  let nextReminderAt: number | null = null;

  for (const assignment of assignments) {
    const acknowledgement = acknowledgements[String(assignment.id)];
    if (
      !acknowledgement ||
      shouldShowAssignmentReminder(
        assignment,
        acknowledgement,
        nowMs,
        normalizedInterval,
      )
    ) {
      return nowMs;
    }

    const candidate =
      Date.parse(acknowledgement.remindedAt) + normalizedInterval;
    nextReminderAt =
      nextReminderAt === null ? candidate : Math.min(nextReminderAt, candidate);
  }

  return nextReminderAt;
}

export function markAssignmentRemindersAcknowledged(
  assignments: PendingAssignmentReminderItem[],
  remindedAt: string,
) {
  const next: AssignmentReminderAcknowledgements = {};
  for (const assignment of assignments) {
    next[String(assignment.id)] = {
      updatedAt: assignment.updatedAt,
      remindedAt,
    };
  }
  return next;
}

export function readAssignmentReminderSnapshot(
  storage: AssignmentReminderStorage,
  studentId: number,
) {
  try {
    return (
      storage.getItem(getStudentAssignmentReminderStorageKey(studentId)) ?? ""
    );
  } catch {
    return "";
  }
}

export function readAssignmentReminderAcknowledgements(
  storage: AssignmentReminderStorage,
  studentId: number,
) {
  return parseAssignmentReminderAcknowledgements(
    readAssignmentReminderSnapshot(storage, studentId),
  );
}

export function storeAssignmentReminderAcknowledgements(
  storage: AssignmentReminderStorage,
  studentId: number,
  assignments: PendingAssignmentReminderItem[],
  remindedAt: string,
) {
  try {
    const next = markAssignmentRemindersAcknowledged(assignments, remindedAt);
    storage.setItem(
      getStudentAssignmentReminderStorageKey(studentId),
      JSON.stringify(next),
    );
  } catch {
    // Storage may be unavailable in private or restricted browser contexts.
    // Failing closed means the reminder appears again instead of disappearing.
  }
}

function isValidDateString(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function normalizeInterval(intervalMs: number) {
  return Number.isFinite(intervalMs) && intervalMs >= 0
    ? intervalMs
    : ASSIGNMENT_REMINDER_INTERVAL_MS;
}
