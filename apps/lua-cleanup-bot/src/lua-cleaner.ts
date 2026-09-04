import type {
  CleanupChange,
  CleanupFinding,
  CleanupMode,
  CleanupResult,
} from "./types.js";

const MAX_SOURCE_BYTES = 256 * 1024;
const IDENTIFIER_PATTERN = /\b[A-Za-z_][A-Za-z0-9_]*\b/g;
const DYNAMIC_EXECUTION_PATTERN =
  /\b(?:loadstring|load|dofile|require|debug\.sethook)\s*\(/;
const ENCODED_STRING_PATTERN =
  /(["'])(?:\\(?:x[0-9a-fA-F]{2}|[0-9]{1,3})|\\z\s+)+.*?\1/s;
const NOOP_PATTERN =
  /^\s*local\s+(?:_+|junk[_$A-Za-z0-9]*)\s*=\s*(?:nil|false|true)\s*;?\s*(?:--.*)?$/i;
const EMPTY_BLOCK_PATTERN = /^\s*do\s*end\s*;?\s*(?:--.*)?$/;

function lineNumberAt(source: string, index: number): number {
  return source.slice(0, index).split("\n").length;
}

function isIdentifierPart(value: string | undefined): boolean {
  return Boolean(value && /[A-Za-z0-9_]/.test(value));
}

function decodePrintableEscapes(value: string): {
  value: string;
  changed: number;
} {
  let changed = 0;
  const decoded = value.replace(
    /\\x([0-9a-fA-F]{2})|\\([0-9]{1,3})/g,
    (match, hex: string | undefined, decimal: string | undefined) => {
      const encoded = hex ?? decimal ?? "";
      const numeric = Number.parseInt(encoded, hex ? 16 : 10);
      if (numeric < 32 || numeric === 127 || numeric > 126) {
        return match;
      }

      const character = String.fromCharCode(numeric);
      if (character === "\\" || character === '"' || character === "'") {
        return match;
      }

      changed += 1;
      return character;
    },
  );

  return { value: decoded, changed };
}

function transformStrings(
  source: string,
  changes: CleanupChange[],
): { source: string; encodedStrings: number } {
  let encodedStrings = 0;
  let output = "";
  let index = 0;
  let line = 1;

  while (index < source.length) {
    const character = source[index];
    const next = source[index + 1];

    if (character === "-" && next === "-") {
      const longStart = source[index + 2] === "[";
      if (longStart) {
        const close = source.indexOf("]]", index + 4);
        const end = close === -1 ? source.length : close + 2;
        const comment = source.slice(index, end);
        output += comment;
        line += comment.split("\n").length - 1;
        index = end;
        continue;
      }

      const end = source.indexOf("\n", index);
      const comment = source.slice(index, end === -1 ? source.length : end);
      output += comment;
      index += comment.length;
      continue;
    }

    if (character !== "'" && character !== '"') {
      output += character;
      if (character === "\n") line += 1;
      index += 1;
      continue;
    }

    const quote = character;
    const start = index;
    let escaped = false;
    index += 1;
    while (index < source.length) {
      const current = source[index];
      if (!escaped && current === quote) {
        index += 1;
        break;
      }
      escaped = !escaped && current === "\\";
      if (current === "\n") line += 1;
      if (current !== "\\") escaped = false;
      index += 1;
    }

    const literal = source.slice(start, index);
    const inner = literal.slice(1, literal.endsWith(quote) ? -1 : undefined);
    const decoded = decodePrintableEscapes(inner);
    if (decoded.changed > 0) {
      encodedStrings += 1;
      changes.push({
        kind: "decoded-string",
        line,
        detail: `Decoded ${decoded.changed} printable escape${decoded.changed === 1 ? "" : "s"} without executing the source.`,
      });
      output += `${quote}${decoded.value}${literal.endsWith(quote) ? quote : ""}`;
    } else {
      output += literal;
    }
  }

  return { source: output, encodedStrings };
}

function maskStringsAndComments(source: string): string {
  let output = "";
  let index = 0;

  while (index < source.length) {
    const character = source[index];
    const next = source[index + 1];

    if (character === "-" && next === "-") {
      const longStart = source[index + 2] === "[";
      const end = longStart
        ? (() => {
            const close = source.indexOf("]]", index + 4);
            return close === -1 ? source.length : close + 2;
          })()
        : (() => {
            const newline = source.indexOf("\n", index);
            return newline === -1 ? source.length : newline;
          })();
      const comment = source.slice(index, end);
      output += comment.replace(/[^\n]/g, " ");
      index = end;
      continue;
    }

    if (character === "'" || character === '"') {
      const quote = character;
      let end = index + 1;
      let escaped = false;
      while (end < source.length) {
        const current = source[end];
        if (!escaped && current === quote) {
          end += 1;
          break;
        }
        escaped = !escaped && current === "\\";
        if (current !== "\\") escaped = false;
        end += 1;
      }
      const literal = source.slice(index, end);
      output += literal.replace(/[^\n]/g, " ");
      index = end;
      continue;
    }

    output += character;
    index += 1;
  }

  return output;
}

function blankLine(source: string): string {
  return source.replace(/[^\n]/g, " ");
}

function removeObviousNoOps(
  source: string,
  mode: CleanupMode,
  changes: CleanupChange[],
): string {
  const lines = source.split("\n");
  const output = lines.map((line, index) => {
    if (NOOP_PATTERN.test(line)) {
      changes.push({
        kind: "removed-noop",
        line: index + 1,
        detail: "Removed a local assignment to a conventional discard/junk variable.",
      });
      return mode === "line-stable" ? blankLine(line) : "";
    }

    if (EMPTY_BLOCK_PATTERN.test(line)) {
      changes.push({
        kind: "removed-empty-block",
        line: index + 1,
        detail: "Removed an empty do/end block.",
      });
      return mode === "line-stable" ? blankLine(line) : "";
    }

    return line;
  });

  return output.join("\n");
}

function collectFindings(source: string, encodedStrings: number): CleanupFinding[] {
  const findings: CleanupFinding[] = [];
  const masked = maskStringsAndComments(source);

  const dynamicMatch = DYNAMIC_EXECUTION_PATTERN.exec(masked);
  if (dynamicMatch) {
    findings.push({
      kind: "dynamic-execution",
      severity: "warning",
      line: lineNumberAt(masked, dynamicMatch.index),
      detail:
        "Dynamic loading or debugging APIs were detected. The bot never executes Lua, so this behavior was preserved.",
    });
  }

  if (encodedStrings > 0 || ENCODED_STRING_PATTERN.test(source)) {
    findings.push({
      kind: "encoded-strings",
      severity: "info",
      detail: `Detected ${Math.max(encodedStrings, 1)} string literal${Math.max(encodedStrings, 1) === 1 ? "" : "s"} containing printable escapes.`,
    });
  }

  const identifiers = masked.match(IDENTIFIER_PATTERN) ?? [];
  const suspicious = identifiers.filter(
    (identifier) =>
      identifier.length >= 18 &&
      !/^(?:function|local|return|repeat|until|while|elseif|end)$/.test(identifier),
  );
  if (suspicious.length >= 3) {
    findings.push({
      kind: "high-entropy-identifiers",
      severity: "info",
      detail: `Found ${suspicious.length} unusually long identifiers. Automatic renaming is intentionally not applied because scope-sensitive renaming can change behavior.`,
    });
  }

  if (Buffer.byteLength(source, "utf8") > MAX_SOURCE_BYTES) {
    findings.push({
      kind: "large-source",
      severity: "warning",
      detail: `Source is larger than the ${MAX_SOURCE_BYTES} byte processing limit.`,
    });
  }

  return findings;
}

export function cleanLua(source: string, mode: CleanupMode = "line-stable"): CleanupResult {
  const inputBytes = Buffer.byteLength(source, "utf8");
  if (inputBytes > MAX_SOURCE_BYTES) {
    throw new Error(`Lua source exceeds the ${MAX_SOURCE_BYTES} byte limit.`);
  }
  if (source.includes("\u0000")) {
    throw new Error("Lua source contains a NUL byte and was rejected.");
  }

  const changes: CleanupChange[] = [];
  const transformed = transformStrings(source, changes);
  const output = removeObviousNoOps(transformed.source, mode, changes);
  const findings = collectFindings(output, transformed.encodedStrings);

  return {
    source,
    output,
    changes,
    findings,
    inputBytes,
    outputBytes: Buffer.byteLength(output, "utf8"),
    inputLines: source.split("\n").length,
    outputLines: output.split("\n").length,
    lineStable: mode === "line-stable",
  };
}

export function formatReport(result: CleanupResult): string {
  const lines = [
    "Lua cleanup report",
    "==================",
    `Input: ${result.inputBytes} bytes, ${result.inputLines} lines`,
    `Output: ${result.outputBytes} bytes, ${result.outputLines} lines`,
    `Line-stable mode: ${result.lineStable ? "yes" : "no"}`,
    "",
    `Changes applied: ${result.changes.length}`,
  ];

  for (const change of result.changes.slice(0, 50)) {
    lines.push(`- line ${change.line}: ${change.detail}`);
  }

  if (result.changes.length > 50) {
    lines.push(`- ...and ${result.changes.length - 50} more changes`);
  }

  lines.push("", `Findings: ${result.findings.length}`);
  for (const finding of result.findings) {
    const location = finding.line ? `line ${finding.line}: ` : "";
    lines.push(`- [${finding.severity}] ${location}${finding.detail}`);
  }

  lines.push(
    "",
    "Safety note: this tool performs static, conservative rewrites only. It does not execute, emulate, or guarantee semantic equivalence for arbitrary obfuscated Lua.",
  );

  return lines.join("\n");
}

export { MAX_SOURCE_BYTES, isIdentifierPart };