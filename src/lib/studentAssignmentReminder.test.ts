import { describe, expect, it } from "vitest";
import {
  ASSIGNMENT_REMINDER_INTERVAL_MS,
  getAssignmentPublisherLabel,
  getNextAssignmentReminderAt,
  getStudentAssignmentReminderStorageKey,
  getUnacknowledgedAssignmentReminders,
  hasIncompleteAssignmentProblems,
  markAssignmentRemindersAcknowledged,
  parseAssignmentReminderAcknowledgements,
  readAssignmentReminderAcknowledgements,
  readAssignmentReminderSnapshot,
  shouldShowAssignmentReminder,
  storeAssignmentReminderAcknowledgements,
  type AssignmentReminderAcknowledgement,
  type AssignmentReminderStorage,
  type PendingAssignmentReminderItem,
} from "./studentAssignmentReminder";

const NOW_MS = Date.parse("2026-07-25T12:00:00.000Z");
const CURRENT_REVISION = "2026-07-25T08:00:00.000Z";

function assignment(
  id: number,
  updatedAt = CURRENT_REVISION,
): PendingAssignmentReminderItem {
  return {
    completedCount: 0,
    dueAt: null,
    id,
    problemCount: 2,
    publisherLabel: "老师：coach",
    title: `任务 ${id}`,
    updatedAt,
  };
}

function acknowledgement(
  remindedAt: string,
  updatedAt = CURRENT_REVISION,
): AssignmentReminderAcknowledgement {
  return { remindedAt, updatedAt };
}

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  const storage: AssignmentReminderStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
  return { storage, values };
}

describe("student assignment reminder state", () => {
  it("accepts only valid v2 acknowledgement records", () => {
    expect(parseAssignmentReminderAcknowledgements(null)).toEqual({});
    expect(parseAssignmentReminderAcknowledgements("{broken")).toEqual({});
    expect(parseAssignmentReminderAcknowledgements("[]")).toEqual({});
    expect(
      parseAssignmentReminderAcknowledgements(
        JSON.stringify({
          3: acknowledgement("2026-07-25T11:30:00.000Z"),
          4: { remindedAt: "invalid", updatedAt: CURRENT_REVISION },
          5: "legacy-v1-revision",
          invalid: acknowledgement("2026-07-25T11:30:00.000Z"),
        }),
      ),
    ).toEqual({
      3: acknowledgement("2026-07-25T11:30:00.000Z"),
    });
  });

  it("shows a task initially and again when the rolling hour expires", () => {
    const item = assignment(1);

    expect(
      shouldShowAssignmentReminder(item, undefined, NOW_MS),
    ).toBe(true);
    expect(
      shouldShowAssignmentReminder(
        item,
        acknowledgement("2026-07-25T11:00:00.001Z"),
        NOW_MS,
      ),
    ).toBe(false);
    expect(
      shouldShowAssignmentReminder(
        item,
        acknowledgement("2026-07-25T11:00:00.000Z"),
        NOW_MS,
      ),
    ).toBe(true);
  });

  it("shows immediately for a changed revision or unsafe reminder time", () => {
    const item = assignment(1);

    expect(
      shouldShowAssignmentReminder(
        item,
        acknowledgement(
          "2026-07-25T11:30:00.000Z",
          "2026-07-24T08:00:00.000Z",
        ),
        NOW_MS,
      ),
    ).toBe(true);
    expect(
      shouldShowAssignmentReminder(
        item,
        acknowledgement("2026-07-25T12:01:00.000Z"),
        NOW_MS,
      ),
    ).toBe(true);
    expect(
      shouldShowAssignmentReminder(
        item,
        { remindedAt: "invalid", updatedAt: CURRENT_REVISION },
        NOW_MS,
      ),
    ).toBe(true);
  });

  it("returns only tasks that need a reminder at the current time", () => {
    const assignments = [
      assignment(1),
      assignment(2),
      assignment(3, "2026-07-25T09:00:00.000Z"),
    ];
    const acknowledgements = {
      1: acknowledgement("2026-07-25T11:30:00.000Z"),
      2: acknowledgement("2026-07-25T10:30:00.000Z"),
      3: acknowledgement("2026-07-25T11:45:00.000Z"),
    };

    expect(
      getUnacknowledgedAssignmentReminders(
        assignments,
        acknowledgements,
        NOW_MS,
      ).map((item) => item.id),
    ).toEqual([2, 3]);
  });

  it("calculates the earliest refresh time without waiting in tests", () => {
    const assignments = [assignment(1), assignment(2)];
    const acknowledgements = {
      1: acknowledgement("2026-07-25T11:20:00.000Z"),
      2: acknowledgement("2026-07-25T11:40:00.000Z"),
    };

    expect(
      getNextAssignmentReminderAt(assignments, acknowledgements, NOW_MS),
    ).toBe(Date.parse("2026-07-25T12:20:00.000Z"));
    expect(
      getNextAssignmentReminderAt(
        assignments,
        { 1: acknowledgements[1] },
        NOW_MS,
      ),
    ).toBe(NOW_MS);
    expect(getNextAssignmentReminderAt([], {}, NOW_MS)).toBeNull();
  });

  it("stores only current task revisions under the current student key", () => {
    expect(
      markAssignmentRemindersAcknowledged(
        [assignment(1), assignment(2)],
        "2026-07-25T12:00:00.000Z",
      ),
    ).toEqual({
      1: acknowledgement("2026-07-25T12:00:00.000Z"),
      2: acknowledgement("2026-07-25T12:00:00.000Z"),
    });

    const { storage, values } = memoryStorage();
    storeAssignmentReminderAcknowledgements(
      storage,
      41,
      [assignment(1)],
      "2026-07-25T12:00:00.000Z",
    );

    expect(readAssignmentReminderAcknowledgements(storage, 41)).toEqual({
      1: acknowledgement("2026-07-25T12:00:00.000Z"),
    });
    expect(readAssignmentReminderAcknowledgements(storage, 42)).toEqual({});
    expect(
      values.has(getStudentAssignmentReminderStorageKey(41)),
    ).toBe(true);
    expect(
      values.has(getStudentAssignmentReminderStorageKey(42)),
    ).toBe(false);
  });

  it("fails closed when browser storage is unavailable", () => {
    const storage: AssignmentReminderStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };

    expect(readAssignmentReminderSnapshot(storage, 1)).toBe("");
    expect(readAssignmentReminderAcknowledgements(storage, 1)).toEqual({});
    expect(() =>
      storeAssignmentReminderAcknowledgements(
        storage,
        1,
        [assignment(1)],
        "2026-07-25T12:00:00.000Z",
      ),
    ).not.toThrow();
  });

  it("uses the fixed one-hour default interval", () => {
    expect(ASSIGNMENT_REMINDER_INTERVAL_MS).toBe(3_600_000);
  });
});

describe("student assignment reminder display rules", () => {
  it("requires at least one unfinished problem", () => {
    expect(hasIncompleteAssignmentProblems([])).toBe(false);
    expect(
      hasIncompleteAssignmentProblems([
        { completedAt: new Date("2026-07-25T00:00:00.000Z") },
      ]),
    ).toBe(false);
    expect(
      hasIncompleteAssignmentProblems([
        { completedAt: new Date("2026-07-25T00:00:00.000Z") },
        { completedAt: null },
      ]),
    ).toBe(true);
  });

  it("uses role-aware publisher labels with a safe historical fallback", () => {
    expect(
      getAssignmentPublisherLabel({ role: "teacher", username: "coach" }),
    ).toBe("老师：coach");
    expect(
      getAssignmentPublisherLabel({ role: "admin", username: "root" }),
    ).toBe("管理员：root");
    expect(getAssignmentPublisherLabel(null)).toBe("老师发布");
    expect(
      getAssignmentPublisherLabel({ role: "student", username: "unexpected" }),
    ).toBe("老师发布");
  });
});
