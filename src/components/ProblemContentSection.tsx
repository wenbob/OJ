import { PageHeading } from "@/components/PageHeading";
import { ProblemRichText } from "@/components/ProblemRichText";

export function ProblemContentSection({ title, value, headingLevel = 2 }: {
  title: string;
  value: string;
  headingLevel?: 2 | 3;
}) {
  const kind = title === "输入格式" ? "input" : title === "输出格式" ? "output" : title === "数据范围" ? "range" : "problem";
  return (
    <section className="mt-8 min-w-0">
      <PageHeading as={headingLevel === 3 ? "h3" : "h2"} kind={kind} size="content">{title}</PageHeading>
      <ProblemRichText className="mt-3 leading-7 text-ink-800" codeClassName="text-sm" value={value} />
    </section>
  );
}
