import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

it("preserves historical data during migration and blocks destructive exam deletion in real SQLite", () => {
  const db = new DatabaseSync(":memory:");
  const fresh = new DatabaseSync(":memory:");
  try {
    const migrations = path.resolve("prisma/migrations");
    for (const name of readdirSync(migrations).filter((name) => /^\d/.test(name) && name < "0024").sort()) {
      db.exec(readFileSync(path.join(migrations, name, "migration.sql"), "utf8"));
    }
    db.exec(`INSERT INTO User(id,username,passwordHash,role) VALUES(1,'student','hash','student');
      INSERT INTO Problem(id,title,description,inputDescription,outputDescription,sampleInput,sampleOutput,difficulty,category) VALUES(1,'original','statement','','','','','basic','test');
      INSERT INTO Exam(id,title,status,updatedAt) VALUES(1,'history','ended',CURRENT_TIMESTAMP),(2,'unused','draft',CURRENT_TIMESTAMP),(3,'legacy draft','draft',CURRENT_TIMESTAMP);
      INSERT INTO ExamRecord(id,examId,userId,status,totalScore) VALUES(1,1,1,'submitted',100);
      INSERT INTO ExamProblem(examId,problemId,snapshotTitle,snapshotScore) VALUES(1,1,'snapshot',100);
      INSERT INTO Submission(id,userId,problemId,examId,submissionType,code,language,status,passedCount,totalCount,runtimeMs) VALUES(1,1,1,1,'exam','kept-code','C++17','Accepted',1,1,1),(2,1,1,3,'exam','legacy-code','C++17','Accepted',1,1,1);`);
    const tables = ["User", "ExamRecord", "Submission", "ExamProblem"];
    const before = tables.map((table) => db.prepare(`SELECT * FROM ${table}`).all());
    db.exec(readFileSync(path.join(migrations, "0024_exam_archiving/migration.sql"), "utf8"));
    fresh.exec(readFileSync(path.resolve("prisma/init.sql"), "utf8"));
    for (const table of ["Exam", "ExamArchiveAudit"]) {
      for (const pragma of ["table_info", "foreign_key_list", "index_list"]) {
        const normalize = (rows: ReturnType<ReturnType<DatabaseSync["prepare"]>["all"]>) => rows.map((row) => {
          const copy = { ...row };
          if (pragma === "table_info") delete copy.cid;
          if (pragma === "index_list") delete copy.seq;
          return copy;
        }).sort((left, right) => String(left.name ?? left.from).localeCompare(String(right.name ?? right.from)));
        expect(normalize(db.prepare(`PRAGMA ${pragma}("${table}")`).all())).toEqual(normalize(fresh.prepare(`PRAGMA ${pragma}("${table}")`).all()));
      }
    }
    expect(tables.map((table) => db.prepare(`SELECT * FROM ${table}`).all())).toEqual(before);
    expect(() => db.exec("DELETE FROM Exam WHERE id=1")).toThrow("EXAM_HISTORY_REQUIRED");
    expect(() => db.exec("DELETE FROM Exam WHERE id=3")).toThrow("EXAM_HISTORY_REQUIRED");
    expect(tables.map((table) => db.prepare(`SELECT * FROM ${table}`).all())).toEqual(before);
    expect(() => db.exec("UPDATE Exam SET status='draft' WHERE id=1")).toThrow("EXAM_ENDED_IMMUTABLE");
    expect(() => db.exec("UPDATE Exam SET archivedAt=CURRENT_TIMESTAMP WHERE id=2")).toThrow("EXAM_ARCHIVE_REQUIRES_ENDED");
    db.exec("DELETE FROM Exam WHERE id=2");
    expect(db.prepare("SELECT id FROM Exam WHERE id=2").get()).toBeUndefined();
    db.exec("UPDATE Exam SET archivedAt=CURRENT_TIMESTAMP WHERE id=1; UPDATE Exam SET archivedAt=NULL WHERE id=1");
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(db.prepare("PRAGMA integrity_check").get()).toMatchObject({ integrity_check: "ok" });
  } finally { db.close(); fresh.close(); }
});
