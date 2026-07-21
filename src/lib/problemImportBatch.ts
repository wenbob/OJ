import type {
  ParsedProblemMarkdown,
  ParseProblemsOptions,
} from "./markdownParser";
import { parseProblemsMarkdown } from "./markdownParser";
import { byteLength } from "./requestLimits";

export const MAX_IMPORT_DOCUMENTS = 20;
export const MAX_IMPORT_DOCUMENT_BYTES = 1024 * 1024;
export const MAX_IMPORT_BATCH_BYTES = 8 * 1024 * 1024;

export type ProblemImportDocument = {
  name: string;
  markdown: string;
};

export type ParsedProblemWithSource = ParsedProblemMarkdown & {
  sourceDocumentIndex: number;
  sourceFileName: string;
};

export type ProblemImportDocumentResult = {
  index: number;
  name: string;
  problemCount: number;
  errors: string[];
};

export function parseProblemImportDocuments(
  documents: ProblemImportDocument[],
  options: ParseProblemsOptions = {},
) {
  if (documents.length === 0) {
    return {
      documents: [] as ProblemImportDocumentResult[],
      errors: ["请选择至少一个 Markdown 文档"],
      problems: [] as ParsedProblemWithSource[],
    };
  }

  if (documents.length > MAX_IMPORT_DOCUMENTS) {
    return {
      documents: [] as ProblemImportDocumentResult[],
      errors: [`一次最多导入 ${MAX_IMPORT_DOCUMENTS} 个 Markdown 文档`],
      problems: [] as ParsedProblemWithSource[],
    };
  }

  if (
    documents.reduce(
      (total, document) => total + byteLength(document.markdown),
      0,
    ) > MAX_IMPORT_BATCH_BYTES
  ) {
    return {
      documents: [] as ProblemImportDocumentResult[],
      errors: ["整批 Markdown 文档内容不能超过 8MB"],
      problems: [] as ParsedProblemWithSource[],
    };
  }

  const problems: ParsedProblemWithSource[] = [];
  const errors: string[] = [];
  const documentResults: ProblemImportDocumentResult[] = [];

  documents.forEach((document, index) => {
    const name = document.name.trim().slice(0, 200) || `文档 ${index + 1}.md`;
    let documentProblems: ParsedProblemMarkdown[] = [];
    let documentErrors: string[] = [];

    if (byteLength(document.markdown) > MAX_IMPORT_DOCUMENT_BYTES) {
      documentErrors = ["文档内容不能超过 1MB"];
    } else {
      const parsed = parseProblemsMarkdown(document.markdown, options);
      documentProblems = parsed.problems;
      documentErrors = parsed.errors;
    }

    problems.push(
      ...documentProblems.map((problem) => ({
        ...problem,
        sourceDocumentIndex: index,
        sourceFileName: name,
      })),
    );
    errors.push(...documentErrors.map((error) => `《${name}》：${error}`));
    documentResults.push({
      index,
      name,
      problemCount: documentProblems.length,
      errors: documentErrors,
    });
  });

  return { documents: documentResults, errors, problems };
}
