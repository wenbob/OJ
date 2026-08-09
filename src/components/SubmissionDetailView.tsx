import Link from "next/link";
import { Code2, FileText } from "lucide-react";
import {
  formatObjectiveSubmittedAnswer,
  ObjectiveCaseFeedbackBadge,
  ObjectiveSubmissionBreakdown,
} from "@/components/ObjectiveSubmissionBreakdown";
import { SubmissionCodeActions } from "@/components/SubmissionCodeActions";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDate, formatRuntime } from "@/lib/format";

type SubmissionCaseResultItem = {
  id: number;
  caseIndex: number;
  status: string;
  input: string;
  expectedOutput: string;
  actualOutput: string | null;
  runtimeMs: number | null;
  errorMessage: string | null;
  studentDetailsHidden?: boolean;
};

type SubmissionDetail = {
  id: number;
  code: string;
  language: string;
  status: string;
  passedCount: number;
  totalCount: number;
  runtimeMs: number;
  submissionType?: string;
  errorMessage: string | null;
  createdAt: Date | string;
  user: {
    username: string;
  };
  problem: {
    id: number;
    title: string;
  };
  exam?: {
    id: number;
    title: string;
  } | null;
  caseResults: SubmissionCaseResultItem[];
};

export function SubmissionDetailView({
  submission,
  problemHref,
  continueHref,
  showCopyCode = true,
}: {
  submission: SubmissionDetail;
  problemHref: string;
  continueHref?: string;
  showCopyCode?: boolean;
}) {
  const isExamSubmission = submission.submissionType === "exam";
  const objective = submission.language === "Objective";

  return (
    <div className="grid gap-6">
      <section className="surface p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.16em] text-clay">
              Submission #{submission.id}
            </p>
            <h1 className="mt-2 text-3xl font-black">提交详情</h1>
          </div>
          <StatusBadge status={submission.status} />
        </div>

        <dl className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <InfoItem
            label="题目"
            value={
              <Link className="font-black text-steel hover:text-clay" href={problemHref}>
                {submission.problem.title}
              </Link>
            }
          />
          <InfoItem label="提交用户" value={submission.user.username} />
          {isExamSubmission ? (
            <InfoItem
              label="所属考试"
              value={submission.exam?.title ?? "已删除考试"}
            />
          ) : (
            <InfoItem label="提交类型" value="日常刷题" />
          )}
          <InfoItem label="代码语言" value={submission.language} />
          <InfoItem label="提交时间" value={formatDate(submission.createdAt)} />
          <InfoItem
            label={objective ? "答对小题" : "通过测试点"}
            value={`${submission.passedCount} / ${submission.totalCount}`}
          />
          <InfoItem label="运行时间" value={formatRuntime(submission.runtimeMs)} />
          <InfoItem label="整体状态" value={submission.status} />
        </dl>

        {submission.errorMessage ? (
          <pre className="mt-5 max-h-56 overflow-auto border border-rose-200 bg-rose-50 p-4 text-xs leading-5 text-rose-700">
            {submission.errorMessage}
          </pre>
        ) : null}
      </section>

      <section className="surface overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-ink-950/10 p-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <Code2 size={18} className="text-steel" />
            <h2 className="text-xl font-black">
              {objective ? "提交答案" : "提交代码"}
            </h2>
          </div>
          {showCopyCode ? (
            <SubmissionCodeActions
              code={submission.code}
              continueHref={continueHref}
            />
          ) : null}
        </div>
        <pre className="max-h-[560px] overflow-auto bg-[#1e1e1e] p-5 text-sm leading-6 text-stone-100">
          {submission.code}
        </pre>
      </section>

      {objective ? (
        <section className="surface p-5">
          <div className="flex items-center gap-2">
            <FileText className="text-steel" size={18} />
            <h2 className="text-xl font-black">逐题结果与作答内容</h2>
          </div>

          <ObjectiveSubmissionBreakdown
            caseResults={submission.caseResults.map((caseResult) => ({
              actualOutput: caseResult.actualOutput,
              caseIndex: caseResult.caseIndex,
              status: caseResult.status,
            }))}
          />

          {submission.caseResults.length > 0 ? (
            <div className="mt-5 grid gap-3">
              {submission.caseResults.map((caseResult) => (
                <details
                  className="border border-ink-950/10 bg-white/65 open:bg-white/82"
                  key={caseResult.id}
                >
                  <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <span className="text-sm font-black">
                      第 {caseResult.caseIndex} 题
                    </span>
                    <ObjectiveCaseFeedbackBadge status={caseResult.status} />
                    <span className="text-sm font-semibold text-ink-700">
                      我的答案：
                      {formatObjectiveSubmittedAnswer(caseResult.actualOutput)}
                    </span>
                  </summary>
                  <div className="grid gap-4 border-t border-ink-950/10 p-4 xl:grid-cols-2">
                    <CaseBlock title="题目" value={caseResult.input} />
                    <CaseBlock
                      title="我的答案"
                      value={formatObjectiveSubmittedAnswer(
                        caseResult.actualOutput,
                      )}
                    />
                    {caseResult.errorMessage ? (
                      <div className="xl:col-span-2">
                        <CaseBlock
                          title="判定信息"
                          tone="error"
                          value={caseResult.errorMessage}
                        />
                      </div>
                    ) : null}
                  </div>
                </details>
              ))}
            </div>
          ) : null}
        </section>
      ) : (
        <section className="surface p-5">
          <div className="flex items-center gap-2">
            <FileText className="text-steel" size={18} />
            <h2 className="text-xl font-black">测试点结果</h2>
          </div>

          {submission.caseResults.length > 0 ? (
            <div className="mt-5 grid gap-3">
              {submission.caseResults.map((caseResult) => (
                <details
                  className="border border-ink-950/10 bg-white/65 open:bg-white/82"
                  key={caseResult.id}
                >
                  <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <span className="text-sm font-black">
                      #{caseResult.caseIndex}
                    </span>
                    <StatusBadge status={caseResult.status} />
                    <span className="text-sm font-semibold text-ink-700">
                      {caseResult.runtimeMs === null
                        ? "无运行时间"
                        : formatRuntime(caseResult.runtimeMs)}
                    </span>
                  </summary>
                  <div className="grid gap-4 border-t border-ink-950/10 p-4 xl:grid-cols-3">
                    {caseResult.studentDetailsHidden ? (
                      <div className="border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800 xl:col-span-2">
                        隐藏测试点的输入和标准输出不对学生公开。
                      </div>
                    ) : (
                      <CaseBlock title="输入" value={caseResult.input} />
                    )}
                    <CaseBlock
                      title="你的输出"
                      value={caseResult.actualOutput ?? "（无输出）"}
                    />
                    {!caseResult.studentDetailsHidden ? (
                      <CaseBlock
                        title="标准输出"
                        value={caseResult.expectedOutput}
                      />
                    ) : null}
                    {caseResult.errorMessage ? (
                      <div className="xl:col-span-3">
                        <CaseBlock
                          title="错误信息"
                          tone="error"
                          value={caseResult.errorMessage}
                        />
                      </div>
                    ) : null}
                  </div>
                </details>
              ))}
            </div>
          ) : (
            <p className="mt-4 border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
              本次提交没有单测试点结果，通常是编译失败或旧数据。
            </p>
          )}
        </section>
      )}
    </div>
  );
}

function InfoItem({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="border border-ink-950/10 bg-white/60 p-3">
      <dt className="text-xs font-black uppercase tracking-[0.12em] text-ink-600">
        {label}
      </dt>
      <dd className="mt-2 text-sm font-bold text-ink-950">{value}</dd>
    </div>
  );
}

function CaseBlock({
  title,
  value,
  tone = "default",
}: {
  title: string;
  value: string;
  tone?: "default" | "error";
}) {
  return (
    <div>
      <h3 className="text-sm font-black text-ink-800">{title}</h3>
      <pre
        className={`mt-2 max-h-72 overflow-auto border p-3 text-xs leading-5 ${
          tone === "error"
            ? "border-rose-200 bg-rose-50 text-rose-700"
            : "border-ink-950/10 bg-linen/70 text-ink-800"
        }`}
      >
        {value}
      </pre>
    </div>
  );
}
