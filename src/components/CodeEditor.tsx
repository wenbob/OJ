"use client";

import Editor from "@monaco-editor/react";
import { useState } from "react";

export type CodeEditorProps = {
  value: string;
  onChange: (value: string) => void;
  language?: string;
  height?: string;
};

const defaultFontSize = 14;
const minFontSize = 12;
const maxFontSize = 26;
const fontSizeStorageKey = "oj-code-editor-font-size";

function readInitialFontSize() {
  if (typeof window === "undefined") return defaultFontSize;

  const savedValue = Number(window.localStorage.getItem(fontSizeStorageKey));
  if (!Number.isFinite(savedValue)) return defaultFontSize;

  return Math.min(maxFontSize, Math.max(minFontSize, savedValue));
}

export default function CodeEditor({
  value,
  onChange,
  language = "cpp",
  height = "460px",
}: CodeEditorProps) {
  const [fontSize, setFontSize] = useState(readInitialFontSize);

  function updateFontSize(nextFontSize: number) {
    const safeFontSize = Math.min(
      maxFontSize,
      Math.max(minFontSize, nextFontSize),
    );
    setFontSize(safeFontSize);
    window.localStorage.setItem(fontSizeStorageKey, String(safeFontSize));
  }

  return (
    <div className="overflow-hidden border border-ink-950/15 bg-[#1e1e1e]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-[#252526] px-3 py-2 text-xs font-bold text-stone-200">
        <span>代码字号：{fontSize}px</span>
        <div className="flex items-center gap-1">
          <button
            aria-label="减小代码字号"
            className="border border-white/15 bg-white/5 px-2 py-1 text-sm font-black text-stone-100 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45"
            disabled={fontSize <= minFontSize}
            onClick={() => updateFontSize(fontSize - 1)}
            type="button"
          >
            A-
          </button>
          <button
            className="border border-white/15 bg-white/5 px-2 py-1 text-xs font-black text-stone-100 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45"
            disabled={fontSize === defaultFontSize}
            onClick={() => updateFontSize(defaultFontSize)}
            type="button"
          >
            默认
          </button>
          <button
            aria-label="增大代码字号"
            className="border border-white/15 bg-white/5 px-2 py-1 text-sm font-black text-stone-100 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45"
            disabled={fontSize >= maxFontSize}
            onClick={() => updateFontSize(fontSize + 1)}
            type="button"
          >
            A+
          </button>
        </div>
      </div>
      <Editor
        height={height}
        language={language}
        loading={
          <div className="flex h-full min-h-80 items-center justify-center bg-[#1e1e1e] text-sm font-semibold text-stone-300">
            编辑器加载中...
          </div>
        }
        onChange={(nextValue) => onChange(nextValue ?? "")}
        options={{
          fontSize,
          fontFamily: "Consolas, Monaco, 'Courier New', monospace",
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 4,
          insertSpaces: true,
          detectIndentation: false,
          autoIndent: "advanced",
          formatOnType: true,
          formatOnPaste: true,
          quickSuggestions: false,
          suggestOnTriggerCharacters: false,
          acceptSuggestionOnCommitCharacter: false,
          acceptSuggestionOnEnter: "off",
          tabCompletion: "off",
          wordBasedSuggestions: "off",
          inlineSuggest: { enabled: false },
          parameterHints: { enabled: false },
          autoClosingBrackets: "always",
          autoClosingQuotes: "always",
          bracketPairColorization: {
            enabled: true,
          },
          guides: {
            bracketPairs: true,
            indentation: true,
          },
          lineNumbers: "on",
          roundedSelection: false,
          cursorStyle: "line",
          wordWrap: "on",
          folding: true,
        }}
        theme="vs-dark"
        value={value}
      />
    </div>
  );
}
