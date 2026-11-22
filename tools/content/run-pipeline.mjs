#!/usr/bin/env node
// Runs tools/content/pipeline.py inside Pyodide (Node), i.e. with the exact Python the browser
// uses (3.14.x), so the bundle and golden files match what learners will see.
// Usage: node tools/content/run-pipeline.mjs [--check]
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const mod = await import(require.resolve("pyodide", { paths: [path.join(root, "apps", "run")] }));
const loadPyodide = mod.loadPyodide ?? mod.default?.loadPyodide;

const py = await loadPyodide();
py.setStdout({ batched: (s) => console.log(s) });
py.setStderr({ batched: (s) => console.error(s) });
py.FS.mkdirTree("/repo");
py.FS.mount(py.FS.filesystems.NODEFS, { root }, "/repo");

py.globals.set("argv", py.toPy(["pipeline.py", "--root", "/repo", ...process.argv.slice(2)]));
const code = py.runPython(`
import runpy, sys
sys.argv = list(argv)
exit_code = 0
try:
    runpy.run_path("/repo/tools/content/pipeline.py", run_name="__main__")
except SystemExit as e:
    exit_code = e.code if isinstance(e.code, int) else (0 if e.code is None else 1)
exit_code
`);
process.exit(code);
