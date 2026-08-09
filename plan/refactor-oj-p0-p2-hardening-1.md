---
goal: Harden the OJ P0-P2 security, exam integrity, judge reliability, and query boundaries
version: 1.0
date_created: 2026-08-09
last_updated: 2026-08-09
owner: Codex
status: 'Completed'
tags: [security, bug, architecture, migration, performance]
---

# Introduction

![Status: Completed](https://img.shields.io/badge/status-Completed-brightgreen)

This plan implements the verified P0, P1, and P2 findings from the 2026-08-09 repository review without deploying, touching the production database, seeding data, or expanding into P3 component restructuring.

## 1. Requirements & Constraints

- **REQ-001**: Student-visible programming submissions must never expose hidden test inputs or expected outputs.
- **REQ-002**: Docker Judge execution must not permit unbounded writes to a host-mounted directory.
- **REQ-003**: Student programming AI context must be derived from server-side active exam state and must enforce the exam AI switch.
- **REQ-004**: Published exam scoring must use an immutable snapshot of title, problem type, objective items, and score.
- **REQ-005**: User mutations must preserve at least one administrator.
- **REQ-006**: Judge queue saturation and infrastructure failures must return retryable service errors instead of generic 500 responses or student compile errors.
- **REQ-007**: AI provider configuration read failures must fail closed.
- **REQ-008**: Login rate-limit storage must be bounded, expire stale entries, and include an aggregate per-IP bucket.
- **REQ-009**: Teacher learning queries must avoid loading every historical failed submission for bounded windows.
- **REQ-010**: Administrator problem lists must return summary data and fetch full problem details only when editing.
- **REQ-011**: Teacher AI summaries must receive category-level aggregate statistics only, without student usernames or problem titles, and AI configuration failures must not block rule diagnosis or assignment tools.
- **REQ-012**: Exam status transitions must reject direct creation in a non-draft state, draft-to-ended skips, and republishing ended exams.
- **SEC-001**: Preserve complete Judge data for administrator and teacher views while redacting only student-visible DTOs.
- **SEC-002**: Preserve Docker network, memory, PID, capability, no-new-privileges, and read-only-root protections.
- **SEC-003**: Preserve API keys in environment variables and never place them in database settings, logs, tests, or client responses.
- **CON-001**: Do not deploy, modify the production database, run seed, or run db:init.
- **CON-002**: Keep SQLite and the current single-instance PM2 deployment supported.
- **CON-003**: Synchronize Prisma schema, migration SQL, and prisma/init.sql for every database change.
- **GUD-001**: Add focused regression tests before running the full repository quality gate.
- **PAT-001**: Reuse existing role-aware API guards, Prisma transactions, explicit student sanitizers, and structured NextResponse errors.

## 2. Implementation Steps

### Implementation Phase 1

- GOAL-001: Remove direct P0 fairness and host-disk risks.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-001 | Update src/lib/submissionVisibility.ts and SubmissionDetailView.tsx so student programming DTOs redact input and expectedOutput and render a non-sensitive placeholder. | ✅ | 2026-08-09 |
| TASK-002 | Update src/lib/dockerJudge.ts so execution mounts workspace read-only, compilation has a bounded file-size limit, and timeout cleanup is awaited. | ✅ | 2026-08-09 |
| TASK-003 | Add and run focused submission visibility and Docker argument tests. | ✅ | 2026-08-09 |

### Implementation Phase 2

- GOAL-002: Enforce exam and administrator integrity invariants.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-004 | Resolve student programming AI exam scope from active ExamRecord state and reject mismatched or omitted client exam context. | ✅ | 2026-08-09 |
| TASK-005 | Add nullable ExamProblem snapshot fields, migration backfill for published and ended exams, and publish-time snapshot creation. | ✅ | 2026-08-09 |
| TASK-006 | Make exam scoring read snapshot fields and block editing published exam membership or linked problem content. | ✅ | 2026-08-09 |
| TASK-007 | Add application checks and SQLite triggers that reject deletion or demotion of the last administrator. | ✅ | 2026-08-09 |
| TASK-008 | Add and run AI, scoring, publishing, exam editing, and administrator invariant regression tests. | ✅ | 2026-08-09 |

### Implementation Phase 3

- GOAL-003: Make Judge overload and infrastructure failures retryable and bounded.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-009 | Add a bounded queue wait deadline and a typed JudgeQueueTimeoutError in src/lib/judgeQueue.ts. | ✅ | 2026-08-09 |
| TASK-010 | Distinguish Docker infrastructure failures from student compile/runtime outcomes. | ✅ | 2026-08-09 |
| TASK-011 | Return 503 plus Retry-After for queue saturation, queue timeout, and Judge infrastructure failures in formal submission APIs. | ✅ | 2026-08-09 |
| TASK-012 | Add and run Judge queue, Docker conversion, and formal submission API regression tests. | ✅ | 2026-08-09 |

### Implementation Phase 4

- GOAL-004: Complete P2 resource and query optimizations.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-013 | Change AI provider configuration reads to fail closed on database errors while retaining legacy fallback only for successful empty configuration reads. | ✅ | 2026-08-09 |
| TASK-014 | Bound login rate-limit buckets with TTL and capacity eviction and enforce both account and aggregate IP limits. | ✅ | 2026-08-09 |
| TASK-015 | Query bounded-window learning submissions plus compact historical baseline rows instead of all submission history. | ✅ | 2026-08-09 |
| TASK-016 | Replace administrator problem list payloads with summary DTOs and add an authenticated detail GET used by the edit action. | ✅ | 2026-08-09 |
| TASK-017 | Add and run AI provider, login rate limit, learning query, and problem manager tests. | ✅ | 2026-08-09 |
| TASK-018 | Remove usernames and problem titles from teacher AI inputs and keep rule diagnosis available when AI configuration reads fail. | ✅ | 2026-08-09 |

### Implementation Phase 5

- GOAL-005: Validate the integrated change set and leave a clean, documented handoff.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-019 | Run Prisma format, generate, validate, and migration checks against a disposable SQLite database. | ✅ | 2026-08-09 |
| TASK-020 | Run npm test, npx tsc --noEmit, npm run lint, npm run build, and git diff --check. | ✅ | 2026-08-09 |
| TASK-021 | Review the final diff for secret leakage, production database changes, generated artifacts, and unintended user-file modifications. | ✅ | 2026-08-09 |

## 3. Alternatives

- **ALT-001**: Hide only failed hidden test cases. Rejected because accepted submissions and successful cases still reveal the full hidden corpus.
- **ALT-002**: Replace the Judge immediately with a durable external worker. Deferred because it exceeds the requested P0-P2 repository hardening scope; bounded synchronous queue behavior is implemented first.
- **ALT-003**: Block all future edits to any problem ever used by an exam. Rejected because immutable scoring snapshots preserve history without permanently freezing the reusable problem bank.
- **ALT-004**: Keep full problem payloads in the administrator list for simpler client code. Rejected because hidden tests and long statements scale poorly and are only needed after an explicit edit action.

## 4. Dependencies

- **DEP-001**: Prisma Client 6.19.3 and SQLite migration support.
- **DEP-002**: Docker CLI support for read-only bind mounts, tmpfs, and ulimit arguments.
- **DEP-003**: Existing Vitest route mocks and React test renderer conventions.
- **DEP-004**: Existing learningAnalytics input semantics for historical accepted and latest-attempt baselines.

## 5. Files

- **FILE-001**: src/lib/submissionVisibility.ts and student submission renderers.
- **FILE-002**: src/lib/dockerJudge.ts, src/lib/judgeQueue.ts, src/lib/judge.ts, and problem submission routes.
- **FILE-003**: src/lib/problemAiAssistRoute.ts and its student API tests.
- **FILE-004**: prisma/schema.prisma, prisma/init.sql, and prisma/migrations/0016_exam_integrity_hardening/migration.sql.
- **FILE-005**: src/lib/examScoring.ts and administrator exam publish/edit routes.
- **FILE-006**: src/app/api/admin/users/[id]/route.ts and administrator mutation tests.
- **FILE-007**: src/lib/aiProvider.ts and src/lib/loginRateLimit.ts.
- **FILE-008**: src/lib/teacherLearning.ts and its new query-focused tests.
- **FILE-009**: src/app/admin/problems/page.tsx, problem-manager.tsx, and administrator problem APIs.

## 6. Testing

- **TEST-001**: Student programming DTOs redact every case input and expected output while staff data remains unchanged.
- **TEST-002**: Docker execution arguments mount workspace read-only and apply a compile file-size limit; cleanup completion is awaited.
- **TEST-003**: Omitting or mismatching examId cannot bypass an active exam AI switch.
- **TEST-004**: Published snapshot values remain authoritative after current problem data changes.
- **TEST-005**: Last-admin demotion and deletion return 409 and database triggers reject direct invalid mutations.
- **TEST-006**: Queue full, queue wait timeout, and Judge infrastructure failures return 503 and Retry-After.
- **TEST-007**: AI provider database read failures reject instead of selecting DeepSeek.
- **TEST-008**: Login buckets do not grow on status reads, expire, remain capacity bounded, and aggregate by IP.
- **TEST-009**: Bounded learning query rows preserve analytics results for representative historical and window submissions.
- **TEST-010**: Problem list responses omit statements and test bodies; authenticated detail responses contain the editor payload.
- **TEST-011**: Teacher AI prompts omit usernames and problem titles, while configuration failures return safe errors without blocking rule-based learning data.

## 7. Risks & Assumptions

- **RISK-001**: Existing published or ended exams need snapshot backfill during migration; migration SQL must use current values exactly once.
- **RISK-002**: Docker ulimit units and bind-mount flags must be verified through argument tests and a real Docker smoke test when the environment supports it.
- **RISK-003**: Raw SQLite learning queries can return date representations that require normalization before analytics use.
- **RISK-004**: Next.js production build may rewrite next-env.d.ts; restore only that generated change if it occurs.
- **ASSUMPTION-001**: Production continues to run one PM2 application instance with SQLite and Docker Judge.
- **ASSUMPTION-002**: It is acceptable to reject editing the problem membership and content of a currently published exam.
- **ASSUMPTION-003**: A retryable 503 is preferable to storing an infrastructure failure as a student error.

## 8. Related Specifications / Further Reading

[OJ collaboration rules](../AGENTS.md)
[Project operations and architecture](../README.md)
[Production deployment guide](../docs/deploy.md)
