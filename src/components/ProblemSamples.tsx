import { CopyCodeButton } from "@/components/CopyCodeButton";
import { PageHeading } from "@/components/PageHeading";

type ProblemSample = {
  id?: number;
  input: string;
  output: string;
};

export function ProblemSamples({
  samples,
  headingLevel = 2,
}: {
  samples: ProblemSample[];
  headingLevel?: 2 | 3;
}) {
  if (samples.length === 0) return null;

  return (
    <section className="mt-8">
      <PageHeading as={headingLevel === 3 ? "h3" : "h2"} kind="samples" size="content">样例</PageHeading>
      <div className="mt-4 grid gap-6">
        {samples.map((sample, index) => (
          <div className="grid gap-4 md:grid-cols-2" key={sample.id ?? index}>
            <SampleBlock headingLevel={headingLevel === 3 ? 4 : 3} title={`样例输入 ${index + 1}`} value={sample.input} />
            <SampleBlock headingLevel={headingLevel === 3 ? 4 : 3} title={`样例输出 ${index + 1}`} value={sample.output} />
          </div>
        ))}
      </div>
    </section>
  );
}

function SampleBlock({ headingLevel, title, value }: { headingLevel: 3 | 4; title: string; value: string }) {
  const Heading = headingLevel === 4 ? "h4" : "h3";
  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-2">
        <Heading className="text-sm font-semibold text-ink-800">{title}</Heading>
        {value ? <CopyCodeButton ariaLabel={`复制${title}`} className="sample-copy-button" code={value} idleLabel="复制" /> : null}
      </div>
      <pre className="mt-2 overflow-x-auto rounded-lg border border-ink-950/10 bg-[#f5f3eb] p-4 text-sm leading-6 text-ink-950">
        {value}
      </pre>
    </div>
  );
}
