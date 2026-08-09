---
goal: Harden AI idempotency and exam UI resilience while reducing oversized administrator components
version: 1.0
date_created: 2026-08-09
last_updated: 2026-08-09
owner: Codex
status: 'Completed'
tags: [security, bug, refactor, testing]
---

# Introduction

![Status: Completed](https://img.shields.io/badge/status-Completed-brightgreen)

This plan implements the remaining second-batch findings from the repository review without deploying, modifying production data, or changing the externally documented OJ workflows.

## 1. Requirements & Constraints

- **REQ-001**: Student objective AI access must be rejected while the account has any valid in-progress formal exam, regardless of whether the requested problem belongs to that exam.
- **REQ-002**: AI `requestId` replay must match the authenticated account and the original problem, exam, scope, mode, AI profile, and objective item index.
- **REQ-003**: Exam start, submit, and administrator exam mutations must restore interactive state after network or response-decoding failures and show a safe user-facing error.
- **REQ-004**: `problem-manager.tsx` and `settings-form.tsx` must shed reusable types, constants, and pure UI sections without changing their API contracts or page behavior.
- **REQ-005**: Regression coverage must include exam AI boundaries, idempotency misuse, network failures, hidden-test visibility, last-admin integrity, Judge failures, and repeated formal submission behavior.
- **SEC-001**: Rejected idempotency conflicts must not reveal the original request's problem, exam, mode, response, or owner.
- **SEC-002**: Objective AI exam checks must use server-side exam records and server-side time/status data only.
- **CON-001**: Do not deploy, modify the production database, run seed, or run db:init.
- **CON-002**: Preserve all first-batch uncommitted changes and avoid unrelated formatting rewrites.
- **CON-003**: Do not add a schema migration when existing audit fields can enforce the invariant.
- **GUD-001**: Add focused regression tests before running the complete repository quality gates.
- **PAT-001**: Reuse existing Prisma selects, typed route errors, React `try/catch/finally` request handling, and server-renderable pure components.

## 2. Implementation Steps

### Implementation Phase 1

- GOAL-001: Bind AI authorization and idempotency to server-side context.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-001 | Update `src/app/api/problems/[id]/objective-explanation/route.ts` to query any in-progress exam for the authenticated student, validate its published status and deadline, and reject AI access when still active. | Yes | 2026-08-09 |
| TASK-002 | Update `src/lib/aiUsageAudit.ts` so `findExistingAiUsageTurn` compares the expected `problemId`, `examId`, `scope`, `mode`, `aiProfile`, and `objectiveItemIndex` before replaying a row. | Yes | 2026-08-09 |
| TASK-003 | Update both AI routes to pass their fully resolved server-side contexts and return 409 for a same-owner context conflict without exposing original metadata. | Yes | 2026-08-09 |
| TASK-004 | Add focused unit and route tests for arbitrary active exams and every request-id context dimension. | Yes | 2026-08-09 |

### Implementation Phase 2

- GOAL-002: Make critical exam actions recover from transport failures.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-005 | Wrap `StartExamButton` and `ExamSubmitButton` requests in `try/catch/finally`, preserving redirects and restoring the buttons on all failures. | Yes | 2026-08-09 |
| TASK-006 | Apply the same error boundary to create/edit/list/member operations in the three administrator exam client modules. | Yes | 2026-08-09 |
| TASK-007 | Add browser-level tests that simulate rejected requests and verify safe errors plus restored controls. | Yes | 2026-08-09 |

### Implementation Phase 3

- GOAL-003: Reduce oversized administrator component responsibilities without behavior changes.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-008 | Extract problem-manager shared types, blank form factories, labels, drag helper, and pure field controls into `problem-manager-support.tsx`. | Yes | 2026-08-09 |
| TASK-009 | Extract settings AI provider, prompt, cooldown, and common field controls into `settings-form-sections.tsx`, using explicit props for state changes and errors. | Yes | 2026-08-09 |
| TASK-010 | Run the existing server-render tests and TypeScript checks to prove the public component contracts are unchanged. | Yes | 2026-08-09 |

### Implementation Phase 4

- GOAL-004: Complete regression verification and handoff.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-011 | Add or consolidate integration-level regression cases for hidden test redaction, last-admin protection, Judge retryable failures, and repeated formal submission behavior. | Yes | 2026-08-09 |
| TASK-012 | Run focused tests, the full Vitest suite, TypeScript, lint, production build, and `git diff --check`. | Yes | 2026-08-09 |
| TASK-013 | Review the final diff for secrets, production-data changes, generated artifacts, and unintended edits; mark the plan completed only when all checks pass. | Yes | 2026-08-09 |

## 3. Alternatives

- **ALT-001**: Add a composite database key for every idempotency context. Rejected because the client contract requires global request IDs and existing rows already contain all comparison fields.
- **ALT-002**: Block objective AI on every raw `in_progress` row forever. Rejected because expired or ended exams must be settled or ignored according to the existing exam deadline semantics.
- **ALT-003**: Rewrite the two large administrator pages around a new state-management library. Rejected because it expands risk and dependency scope beyond the requested maintainability optimization.
- **ALT-004**: Rely only on mocked component tests for network failures. Rejected because a small Playwright development-only suite can exercise the real page, cookies, route guards, and API stack against an isolated database.

## 4. Dependencies

- **DEP-001**: Prisma Client 6.19.3 models `AiConversation`, `AiConversationTurn`, and `ExamRecord`.
- **DEP-002**: Existing exam time helpers in `src/lib/examScoring.ts`.
- **DEP-003**: Existing Vitest 4.1.5 route mocks and React server-render tests.
- **DEP-004**: Existing first-batch security tests for submission visibility, administrator integrity, and Judge error classification.
- **DEP-005**: Playwright Test 1.62.0 and a locally installed Chrome/Chromium browser.

## 5. Files

- **FILE-001**: `src/lib/aiUsageAudit.ts` and `src/lib/aiUsageAudit.test.ts`.
- **FILE-002**: `src/app/api/problems/[id]/objective-explanation/route.ts` and its route test.
- **FILE-003**: `src/lib/problemAiAssistRoute.ts` and `src/app/api/ai/problem-assist/route.test.ts`.
- **FILE-004**: Student and administrator exam client components plus new component regression tests.
- **FILE-005**: `src/app/admin/problems/problem-manager.tsx` and `problem-manager-support.tsx`.
- **FILE-006**: `src/app/admin/settings/settings-form.tsx` and `settings-form-sections.tsx`.
- **FILE-007**: Existing first-batch visibility, administrator, Judge, and submission regression tests.
- **FILE-008**: `playwright.config.ts`, `e2e/critical-flows.spec.ts`, and isolated E2E setup/cleanup scripts.

## 6. Testing

- **TEST-001**: A different-problem active exam blocks objective AI, while an expired or ended exam does not remain an active lock.
- **TEST-002**: A request ID cannot replay across problem, exam, practice/exam scope, mode, AI profile, or objective item index.
- **TEST-003**: A valid identical-context request ID still replays without another provider call or cooldown consumption.
- **TEST-004**: Rejected `fetch` promises restore every tested pending button and display a generic network error.
- **TEST-005**: Extracted problem and settings sections render the same labels, ordering controls, prompts, and default values.
- **TEST-006**: Existing P0 hidden-test redaction and P1 administrator/Judge/formal-submission cases remain green in the full suite.

## 7. Risks & Assumptions

- **RISK-001**: Settling a stale exam record inside an AI request can contend with another exam-finishing request; existing idempotent `finishExamRecord` behavior must remain authoritative.
- **RISK-002**: One shared `pending` state in the exam editor disables all operations; this batch restores it reliably but does not redesign per-row concurrency.
- **RISK-003**: Large-file extraction can introduce circular imports; support modules must depend only on shared libraries and leaf components.
- **ASSUMPTION-001**: Client-generated request IDs are opaque and may be retried only for the same logical request context.
- **ASSUMPTION-002**: A student should not access daily objective explanations while taking any formal exam, matching the documented rule that formal exam pages and APIs must reject the feature.

## 8. Related Specifications / Further Reading

[Second-batch context map](./context-map-oj-second-batch-1.md)
[First-batch hardening plan](./refactor-oj-p0-p2-hardening-1.md)
[OJ collaboration rules](../AGENTS.md)
