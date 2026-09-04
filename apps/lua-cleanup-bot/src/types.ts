export type CleanupMode = "safe" | "line-stable";

export type CleanupChange = {
  kind:
    | "decoded-string"
    | "removed-noop"
    | "removed-empty-block"
    | "normalized-whitespace";
  line: number;
  detail: string;
};

export type CleanupFinding = {
  kind:
    | "dynamic-execution"
    | "encoded-strings"
    | "high-entropy-identifiers"
    | "large-source"
    | "unsupported-pattern";
  severity: "info" | "warning";
  line?: number;
  detail: string;
};

export type CleanupResult = {
  source: string;
  output: string;
  changes: CleanupChange[];
  findings: CleanupFinding[];
  inputBytes: number;
  outputBytes: number;
  inputLines: number;
  outputLines: number;
  lineStable: boolean;
};