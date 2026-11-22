#!/usr/bin/env node
// CPython vs Pyodide behaviour parity (plan §3.7, F1 open item).
// Runs the same snippets in Pyodide (inside Node) and in a real CPython, compares stdout and
// the last traceback line (we explain error messages to learners, so they must match).
// Enforced only when the CPython minor version equals Pyodide's (CI pins 3.14);
// otherwise differences are reported as warnings.
// Usage: node tools/tests/python_parity.mjs   (PARITY_PYTHON=python3.14 to choose the binary)
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const runDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..", "apps", "run");
const pyodideMod = await import(require.resolve("pyodide", { paths: [runDir] }));
const loadPyodide = pyodideMod.loadPyodide ?? pyodideMod.default?.loadPyodide;

const SNIPPETS = {
  "print + sep/end": `print("a", "b", sep="-", end="!\\n")`,
  "int vs float division": `print(7 / 2, 7 // 2, -7 // 2, 7 % 3, -7 % 3)`,
  "float repr": `print(0.1 + 0.2, round(2.5), round(3.5), 1e16, 1/3)`,
  "big ints": `print(2 ** 100, len(str(10 ** 1000)))`,
  "f-strings": `x = 3.14159\nname = "Ada"\nprint(f"{name!r:>8}|{x:.2f}|{x=}|{1000000:,}")`,
  "str methods": `s = "  Hello, World  "\nprint(s.strip().lower().split(", "), "-".join(["a", "b"]), s.count("l"), "abc"[::-1])`,
  "dict order + comprehension": `d = {k: k * k for k in [3, 1, 2]}\nprint(d, list(d), sorted(d.items(), key=lambda kv: -kv[1]))`,
  "sort stability": `print(sorted([("b", 1), ("a", 1), ("c", 0)], key=lambda t: t[1]))`,
  "sets (ints)": `print(sorted({3, 1, 2} | {4}), {1, 2} & {2, 3}, {1, 2} - {2})`,
  "aliasing": `a = [1, 2]\nb = a\nb.append(3)\nprint(a, a is b, a == [1, 2, 3])`,
  "generators": `g = (i * i for i in range(4))\nprint(list(g), list(g))`,
  "NameError + suggestion": `count = 1\nprint(cout)`,
  "TypeError str + int": `print("age: " + 5)`,
  "ValueError int()": `int("abc")`,
  "IndexError": `items = [1, 2, 3]\nprint(items[3])`,
  "KeyError": `d = {"a": 1}\nprint(d["b"])`,
  "ZeroDivisionError": `print(1 / 0)`,
  "AttributeError + suggestion": `"text".uper()`,
  "UnboundLocalError": `x = 1\ndef f():\n    x += 1\nf()`,
  "RecursionError": `def f(n):\n    return f(n + 1)\nf(0)`,
  "SyntaxError: = in if": `x = 5\nif x = 5:\n    print(x)`,
  "IndentationError": `if True:\nprint("x")`,
};

const WRAP = (code) => `
import sys, traceback
_src = ${JSON.stringify(code)}
try:
    exec(compile(_src, "/main.py", "exec"), {"__name__": "__main__"})
except BaseException as e:
    line = traceback.format_exception_only(type(e), e)[-1].strip()
    print("EXC:", line)
`;

function runCPython(bin, code) {
  return execFileSync(bin, ["-c", WRAP(code)], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

const bin = process.env.PARITY_PYTHON || "python3";
const cpyVersion = execFileSync(bin, ["-c", "import sys; print('%d.%d' % sys.version_info[:2])"], { encoding: "utf8" }).trim();
const py = await loadPyodide();
const pyoVersion = py.runPython("import sys; '%d.%d' % sys.version_info[:2]");
let out = "";
py.setStdout({ batched: (s) => { out += s + "\n"; } });
const enforce = cpyVersion === pyoVersion;

let mismatches = 0;
for (const [name, code] of Object.entries(SNIPPETS)) {
  out = "";
  py.runPython(WRAP(code));
  const a = runCPython(bin, code).trimEnd();
  const b = out.trimEnd();
  if (a === b) console.log(`PASS  ${name}`);
  else {
    mismatches++;
    console.log(`${enforce ? "FAIL" : "WARN"}  ${name}\n      CPython ${cpyVersion}: ${JSON.stringify(a)}\n      Pyodide ${pyoVersion}: ${JSON.stringify(b)}`);
  }
}
console.log(`\nCPython ${cpyVersion} vs Pyodide ${pyoVersion}: ${Object.keys(SNIPPETS).length - mismatches}/${Object.keys(SNIPPETS).length} identical${enforce ? "" : " (versions differ: not enforced)"}`);
process.exit(enforce && mismatches ? 1 : 0);
