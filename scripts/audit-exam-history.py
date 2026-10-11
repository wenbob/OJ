"""Read-only exam-link audit; never guesses links or restores a database.

python scripts/audit-exam-history.py --db prisma/dev.db --out tmp/history.json
Use --backup FILE repeatedly or --backup-dir DIR for prod-*.db snapshots.
Reports contain numeric IDs and evidence hashes, never code or credentials.
"""
import argparse
import collections
import datetime
import hashlib
import json
import os
from pathlib import Path
import sqlite3


def connect_read_only(path):
    connection = sqlite3.connect(path.resolve().as_uri() + "?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA query_only=ON")
    connection.execute("BEGIN")
    return connection


def fingerprint(row):
    fields = ("id", "userId", "problemId", "submissionType", "createdAt", "language", "code", "status", "passedCount", "totalCount", "runtimeMs")
    values = [row[field] for field in fields]
    return hashlib.sha256(json.dumps(values, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()


def audit(source, backups):
    current = connect_read_only(source)
    try:
        assert current.execute("PRAGMA quick_check").fetchone()[0] == "ok", "Source integrity check failed"
        missing = {row["id"]: row for row in current.execute("SELECT * FROM Submission WHERE submissionType='exam' AND examId IS NULL ORDER BY id")}
        findings = {key: {} for key in missing}
        inspected = []
        for backup in sorted(set(path.resolve() for path in backups)):
            if backup == source.resolve():
                continue
            entry = {"file": backup.name, "bytes": backup.stat().st_size}
            previous = None
            try:
                previous = connect_read_only(backup)
                assert previous.execute("PRAGMA quick_check").fetchone()[0] == "ok", "Backup integrity check failed"
                entry["integrity"] = "ok"
                entry["matching_linked_submissions"] = 0
                for row in previous.execute("SELECT * FROM Submission WHERE submissionType='exam' AND examId IS NOT NULL"):
                    identifier = row["id"]
                    if identifier not in missing or fingerprint(row) != fingerprint(missing[identifier]):
                        continue
                    exam = previous.execute("SELECT * FROM Exam WHERE id=?", (row["examId"],)).fetchone()
                    has_records = previous.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ExamRecord'").fetchone()
                    record = previous.execute("SELECT id FROM ExamRecord WHERE examId=? AND userId=?", (row["examId"], row["userId"])).fetchone() if has_records else None
                    problem = previous.execute("SELECT * FROM ExamProblem WHERE examId=? AND problemId=?", (row["examId"], row["problemId"])).fetchone()
                    if not exam:
                        continue
                    snapshots = ("snapshotAt", "snapshotTitle", "snapshotProblemType", "snapshotScore")
                    complete = bool(record and problem) and all(name in problem.keys() and problem[name] is not None for name in snapshots)
                    exam_type = exam["examType"] if "examType" in exam.keys() else "programming"
                    if complete and exam_type == "objective":
                        complete = complete and "snapshotObjectiveItems" in problem.keys() and problem["snapshotObjectiveItems"] is not None
                    # IDs may be reused after a reset; retain creation and snapshot
                    # identities to detect conflicting evidence.
                    exam_identity = {name: exam[name] for name in ("id", "createdAt", "title")}
                    identity = hashlib.sha256(json.dumps([exam_identity, dict(problem) if problem else None], sort_keys=True, ensure_ascii=False).encode()).hexdigest()
                    candidate = findings[identifier].setdefault(identity, {"exam_id": row["examId"], "identity_hash": identity, "complete_snapshot": complete, "has_exam_record": bool(record), "has_exam_problem": bool(problem), "backups": []})
                    candidate["complete_snapshot"] = candidate["complete_snapshot"] or complete
                    candidate["has_exam_record"] = candidate["has_exam_record"] or bool(record)
                    candidate["has_exam_problem"] = candidate["has_exam_problem"] or bool(problem)
                    candidate["backups"].append(backup.name)
                    entry["matching_linked_submissions"] += 1
            except (sqlite3.DatabaseError, AssertionError) as error:
                entry["error"] = str(error)
            finally:
                if previous is not None:
                    previous.rollback()
                    previous.close()
            inspected.append(entry)
        items = []
        for identifier, row in missing.items():
            candidates = list(findings[identifier].values())
            conclusion = "no_backup_evidence"
            if len(candidates) > 1:
                conclusion = "conflicting_backup_evidence"
            elif candidates:
                conclusion = "complete_backup_evidence" if candidates[0]["complete_snapshot"] else "partial_backup_evidence"
            items.append({"submission_id": identifier, "user_id": row["userId"], "problem_id": row["problemId"], "created_at": row["createdAt"], "status": row["status"], "conclusion": conclusion, "candidates": candidates})
        return {"checked_at": datetime.datetime.now(datetime.timezone.utc).isoformat(), "source": str(source.resolve()), "read_only": True,
                "interpretation": "Complete evidence identifies restoration candidates; no writes performed. Missing links alone do not prove the historical cause.",
                "summary": {"missing_exam_links": len(items), "affected_accounts": len({row["userId"] for row in missing.values()}), **dict(collections.Counter(item["conclusion"] for item in items))},
                "backups": inspected, "items": items}
    finally:
        current.rollback()
        current.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--backup", type=Path, action="append", default=[])
    parser.add_argument("--backup-dir", type=Path)
    args = parser.parse_args()
    backups = args.backup + (list(args.backup_dir.glob("prod-*.db")) if args.backup_dir else [])
    output = args.out.resolve()
    if output.suffix != ".json" or output in {args.db.resolve(), *(path.resolve() for path in backups)}:
        raise SystemExit("Output must be a separate JSON file")
    result = audit(args.db, backups)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.chmod(output, 0o600)
    print(json.dumps({"output": str(output), "summary": result["summary"], "backup_count": len(result["backups"])}))
