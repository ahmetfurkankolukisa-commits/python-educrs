#!/usr/bin/env node
// Runs stdlib unittest modules inside Pyodide (Node) — the browser's exact Python — so grader
// and explainer tests are proven on 3.14.x even when the machine's CPython is another version.
// Usage: node tools/tests/run-unittests-pyodide.mjs test_grader.py test_explain.py ...
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const patterns = process.argv.slice(2);
if (patterns.length === 0) { console.error("give at least one test file name"); process.exit(2); }

const require = createRequire(import.meta.url);
const mod = await import(require.resolve("pyodide", { paths: [path.join(root, "apps", "run")] }));
const loadPyodide = mod.loadPyodide ?? mod.default?.loadPyodide;
const py = await loadPyodide();
py.setStdout({ batched: (s) => console.log(s) });
py.setStderr({ batched: (s) => console.error(s) });
py.FS.mkdirTree("/repo");
py.FS.mount(py.FS.filesystems.NODEFS, { root }, "/repo");
py.globals.set("patterns", py.toPy(patterns));

const ok = py.runPython(`
import sys, unittest
sys.path.insert(0, "/repo/tools/tests")
print(f"Pyodide Python {sys.version.split()[0]}")
suite = unittest.TestSuite()
for p in patterns:
    suite.addTests(unittest.defaultTestLoader.discover("/repo/tools/tests", pattern=p, top_level_dir="/repo/tools/tests"))
result = unittest.TextTestRunner(stream=sys.stdout, verbosity=1).run(suite)
result.wasSuccessful()
`);
process.exit(ok ? 0 : 1);
