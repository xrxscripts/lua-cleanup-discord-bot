import { readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { cleanLua, formatReport } from "./lua-cleaner.js";

const argumentOffset = process.argv[2] === "--" ? 1 : 0;
const inputPath = process.argv[2 + argumentOffset];
if (!inputPath) {
  throw new Error("Usage: pnpm clean -- path/to/file.lua [output.lua]");
}

if (extname(inputPath).toLowerCase() !== ".lua") {
  throw new Error("The input file must use the .lua extension.");
}

const outputPath =
  process.argv[3 + argumentOffset] ??
  join(dirname(inputPath), `${basename(inputPath, ".lua")}.clean.lua`);
const source = await readFile(inputPath, "utf8");
const result = cleanLua(source);
await writeFile(outputPath, result.output, "utf8");
await writeFile(`${outputPath}.report.txt`, formatReport(result), "utf8");

process.stdout.write(
  `Wrote ${outputPath} and ${outputPath}.report.txt\n` +
    `${result.changes.length} change(s), ${result.findings.length} finding(s)\n`,
);