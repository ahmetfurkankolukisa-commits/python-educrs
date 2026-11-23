#!/usr/bin/env node
// CI runs the e2e suite as one job per Playwright project (.github/workflows/ci.yml, job `e2e`).
// A project that is in playwright.config.ts but not in that job's list would never run in CI, and
// nothing would look wrong. This check fails unless the two lists are the same.
//
// Like the other gates it proves on every run that it can fail (CLAUDE.md: "prove checks fire"):
// before reading the real files it feeds itself lists and workflows that are wrong on purpose.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOW = ".github/workflows/ci.yml";

/** What differs between the config's projects and the job's list. All empty = the same. */
export function difference(projects, matrix) {
  return {
    notInCi: projects.filter((p) => !matrix.includes(p)),
    notInConfig: matrix.filter((m) => !projects.includes(m)),
    twice: matrix.filter((m, i) => matrix.indexOf(m) !== i),
  };
}

/** The `project: [a, b]` list of the `e2e` job. Throws when the job or the list is not there. */
export function matrixOf(yaml) {
  const lines = yaml.split("\n");
  const start = lines.findIndex((l) => /^ {2}e2e:\s*$/.test(l));
  if (start < 0) throw new Error("no `e2e` job");
  // The job ends at the next line indented like a job name.
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^ {2}\S/.test(l));
  const job = (end < 0 ? rest : rest.slice(0, end)).join("\n");
  const list = /^\s+matrix:\n\s+project:\s*\[([^\]\n]*)\]\s*$/m.exec(job);
  if (!list) throw new Error("the `e2e` job has no `matrix: project: [...]` list");
  const names = list[1].split(",").map((s) => s.trim()).filter(Boolean);
  if (names.length === 0) throw new Error("the `e2e` job's project list is empty");
  return names;
}

function problems(projects, matrix) {
  const d = difference(projects, matrix);
  return [
    ...d.notInCi.map((p) => `"${p}" is in playwright.config.ts but not in the e2e job: it would never run in CI`),
    ...d.notInConfig.map((p) => `"${p}" is in the e2e job but not in playwright.config.ts`),
    ...d.twice.map((p) => `"${p}" is listed twice in the e2e job`),
  ];
}

// ------------------------------------------------------------------ self-test
const job = (list) => `jobs:\n  e2e:\n    strategy:\n      matrix:\n        project: [${list}]\n    steps: []\n`;
const throws = (fn) => { try { fn(); return false; } catch { return true; } };
const SELF = [
  ["equal lists pass", problems(["a", "b"], matrixOf(job("b, a"))).length === 0],
  ["a project missing from CI is reported", problems(["a", "b"], matrixOf(job("a")))[0]?.includes('"b"') === true],
  ["a name that is not a project is reported", problems(["a"], matrixOf(job("a, c")))[0]?.includes('"c"') === true],
  ["a project listed twice is reported", problems(["a"], matrixOf(job("a, a"))).length === 1],
  ["a workflow without the e2e job is an error", throws(() => matrixOf("jobs:\n  checks:\n    steps: []\n"))],
  ["a list in another job does not count", throws(() => matrixOf(`jobs:\n  e2e:\n    steps: []\n  other:\n    strategy:\n      matrix:\n        project: [a]\n`))],
  ["an empty list is an error", throws(() => matrixOf(job("")))],
];
const broken = SELF.filter(([, ok]) => !ok).map(([name]) => name);
if (broken.length > 0) {
  console.error(`check-ci-matrix: the check itself is broken:\n  ${broken.join("\n  ")}`);
  process.exit(1);
}

// ------------------------------------------------------------------ the real files
const config = (await import(pathToFileURL(path.join(root, "playwright.config.ts")).href)).default;
const projects = (config.projects ?? []).map((p) => p.name);
if (projects.length === 0) {
  console.error("check-ci-matrix: playwright.config.ts has no projects");
  process.exit(1);
}
let matrix;
try {
  matrix = matrixOf(fs.readFileSync(path.join(root, WORKFLOW), "utf8"));
} catch (e) {
  console.error(`check-ci-matrix: ${WORKFLOW}: ${e.message}`);
  process.exit(1);
}
const found = problems(projects, matrix);
if (found.length > 0) {
  console.error(`check-ci-matrix: ${WORKFLOW} and playwright.config.ts disagree:\n  ${found.join("\n  ")}`);
  process.exit(1);
}
console.log(`check-ci-matrix: ${projects.length} Playwright projects, each has its CI job (${projects.join(", ")}); self-test ${SELF.length}/${SELF.length}`);
