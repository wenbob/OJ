import type { PublicObjectiveItem } from "@/lib/objectiveProblem";
import { ProblemRichText } from "./ProblemRichText";

type ObjectiveProblemContentItem = PublicObjectiveItem & {
  answer?: string;
};

export function ObjectiveProblemContent({
  items,
  showAnswers = false,
}: {
  items: ObjectiveProblemContentItem[];
  showAnswers?: boolean;
}) {
  const totalScore = items.reduce((sum, item) => sum + item.score, 0);

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-ink-950/10 pb-4">
        <div>
          <h2 className="text-xl font-black">选择判断题</h2>
          <p className="mt-1 text-sm font-semibold text-ink-600">
            按题号顺序作答，答案输入区每行填写一个选项字母。
          </p>
        </div>
        <span className="text-sm font-black text-clay">
          共 {items.length} 题 · {totalScore} 分
        </span>
      </div>

      <div className="divide-y divide-ink-950/10">
        {items.map((item, index) => (
          <article className="py-6" key={`${index}-${item.stem}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-black uppercase tracking-[0.12em] text-steel">
                第 {index + 1} 题 · {item.kind === "judge" ? "判断题" : "单选题"}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {showAnswers && item.answer ? (
                  <span className="border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700">
                    答案 {item.answer}
                  </span>
                ) : null}
                <span className="border border-clay/20 bg-clay/10 px-2.5 py-1 text-xs font-black text-clay">
                  {item.score} 分
                </span>
              </div>
            </div>
            <ProblemRichText
              className="mt-4 text-base font-bold leading-7 text-ink-950"
              codeClassName="text-sm"
              value={item.stem}
            />
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {item.options.map((option) => (
                <div
                  className="grid grid-cols-[2rem_minmax(0,1fr)] items-start border border-ink-950/10 bg-white/58 px-3 py-3"
                  key={option.label}
                >
                  <span className="font-black text-steel">{option.label}</span>
                  <ProblemRichText
                    className="text-sm font-semibold leading-6 text-ink-800"
                    codeClassName="text-xs"
                    value={option.text}
                  />
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
