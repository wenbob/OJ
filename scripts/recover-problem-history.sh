#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <target-current-db> <source-backup-db>" >&2
  exit 64
fi

target_db="$(readlink -f "$1")"
source_db="$(readlink -f "$2")"

if [[ ! -f "$target_db" || ! -f "$source_db" ]]; then
  echo "Both target and source databases must exist." >&2
  exit 66
fi
if [[ "$target_db" == "$source_db" ]]; then
  echo "Target and source databases must be different files." >&2
  exit 64
fi
if [[ "$target_db" == *"'"* || "$source_db" == *"'"* ]]; then
  echo "Database paths containing a single quote are not supported." >&2
  exit 64
fi
command -v sqlite3 >/dev/null 2>&1 || {
  echo "sqlite3 is required." >&2
  exit 69
}

for db in "$target_db" "$source_db"; do
  if [[ "$(sqlite3 "$db" 'PRAGMA quick_check;')" != "ok" ]]; then
    echo "Database integrity check failed: $db" >&2
    exit 65
  fi
done

if [[ "$(sqlite3 "$target_db" "SELECT COUNT(*) FROM pragma_table_info('Problem') WHERE name='archivedAt';")" != "1" ]]; then
  echo "Target database is missing Problem.archivedAt. Apply migrations first." >&2
  exit 65
fi

submission_id_conflicts="$(sqlite3 "$target_db" <<SQL
ATTACH DATABASE '$source_db' AS source_db;
SELECT COUNT(*)
FROM source_db.Submission AS source_submission
JOIN source_db.Problem AS source_problem ON source_problem.id = source_submission.problemId
LEFT JOIN main.Problem AS target_problem ON target_problem.id = source_problem.id
JOIN main.Submission AS target_submission ON target_submission.id = source_submission.id
WHERE target_problem.id IS NULL;
SQL
)"
if [[ "$submission_id_conflicts" != "0" ]]; then
  echo "Recovery aborted: $submission_id_conflicts submission ID conflict(s) found." >&2
  exit 65
fi

sqlite3 -bail "$target_db" <<SQL
PRAGMA foreign_keys = ON;
ATTACH DATABASE '$source_db' AS source_db;

BEGIN IMMEDIATE;

CREATE TEMP TABLE restore_problem_ids AS
SELECT source_problem.id
FROM source_db.Problem AS source_problem
LEFT JOIN main.Problem AS target_problem ON target_problem.id = source_problem.id
WHERE target_problem.id IS NULL;

CREATE TEMP TABLE restore_submission_ids AS
SELECT source_submission.id
FROM source_db.Submission AS source_submission
JOIN restore_problem_ids AS restored_problem
  ON restored_problem.id = source_submission.problemId
LEFT JOIN main.Submission AS target_submission
  ON target_submission.id = source_submission.id
WHERE target_submission.id IS NULL;

INSERT INTO main.Problem (
  id, title, description, inputDescription, outputDescription,
  sampleInput, sampleOutput, dataRange, difficulty, category,
  problemType, objectiveItems, archivedAt, createdAt, updatedAt
)
SELECT
  source_problem.id,
  source_problem.title,
  source_problem.description,
  source_problem.inputDescription,
  source_problem.outputDescription,
  source_problem.sampleInput,
  source_problem.sampleOutput,
  source_problem.dataRange,
  source_problem.difficulty,
  source_problem.category,
  source_problem.problemType,
  source_problem.objectiveItems,
  CURRENT_TIMESTAMP,
  source_problem.createdAt,
  source_problem.updatedAt
FROM source_db.Problem AS source_problem
JOIN restore_problem_ids AS restored_problem ON restored_problem.id = source_problem.id;

INSERT INTO main.TestCase (
  problemId, input, output, isSample, createdAt
)
SELECT
  source_case.problemId,
  source_case.input,
  source_case.output,
  source_case.isSample,
  source_case.createdAt
FROM source_db.TestCase AS source_case
JOIN restore_problem_ids AS restored_problem ON restored_problem.id = source_case.problemId;

INSERT INTO main.Submission (
  id, userId, problemId, examId, learningAssignmentId, submissionType,
  code, language, status, passedCount, totalCount, runtimeMs,
  errorMessage, createdAt
)
SELECT
  source_submission.id,
  source_submission.userId,
  source_submission.problemId,
  CASE
    WHEN source_submission.examId IS NULL THEN NULL
    WHEN EXISTS (SELECT 1 FROM main.Exam WHERE id = source_submission.examId)
      THEN source_submission.examId
    ELSE NULL
  END,
  CASE
    WHEN source_submission.learningAssignmentId IS NULL THEN NULL
    WHEN EXISTS (
      SELECT 1
      FROM main.LearningAssignment
      WHERE id = source_submission.learningAssignmentId
    ) THEN source_submission.learningAssignmentId
    ELSE NULL
  END,
  source_submission.submissionType,
  source_submission.code,
  source_submission.language,
  source_submission.status,
  source_submission.passedCount,
  source_submission.totalCount,
  source_submission.runtimeMs,
  source_submission.errorMessage,
  source_submission.createdAt
FROM source_db.Submission AS source_submission
JOIN restore_submission_ids AS restored_submission
  ON restored_submission.id = source_submission.id
JOIN main.User AS target_user ON target_user.id = source_submission.userId;

INSERT INTO main.SubmissionCaseResult (
  submissionId, caseIndex, status, input, expectedOutput,
  actualOutput, runtimeMs, errorMessage, createdAt
)
SELECT
  source_result.submissionId,
  source_result.caseIndex,
  source_result.status,
  source_result.input,
  source_result.expectedOutput,
  source_result.actualOutput,
  source_result.runtimeMs,
  source_result.errorMessage,
  source_result.createdAt
FROM source_db.SubmissionCaseResult AS source_result
JOIN restore_submission_ids AS restored_submission
  ON restored_submission.id = source_result.submissionId;

SELECT 'restored_problems=' || COUNT(*) FROM restore_problem_ids;
SELECT 'restored_submissions=' || COUNT(*) FROM restore_submission_ids;
SELECT 'restored_test_cases=' || COUNT(*)
FROM main.TestCase
WHERE problemId IN (SELECT id FROM restore_problem_ids);
SELECT 'restored_case_results=' || COUNT(*)
FROM main.SubmissionCaseResult
WHERE submissionId IN (SELECT id FROM restore_submission_ids);

COMMIT;
DETACH DATABASE source_db;

PRAGMA foreign_key_check;
PRAGMA quick_check;
SQL
