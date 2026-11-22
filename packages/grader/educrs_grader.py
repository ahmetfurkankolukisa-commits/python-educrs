"""educrs grader v1 (docs/05-f3-mvp0.md §3).

ONE file, run unchanged in the browser (Pyodide, inside a fresh sandbox worker) and in CI
(CPython 3.14 and Pyodide-in-Node), so what CI validates is exactly what learners get.

Rules this module enforces:
  * Expected output is never hand-written: it is produced by running the reference solution.
  * Everything that defines "correct" (solution + misconception programs) runs BEFORE any
    learner code, so learner code cannot contaminate it.
  * Random tests are drawn from random.Random(seed): same seed + same code = same result.
  * Results are structured data (codes, values); learner-facing wording lives in the app (i18n).

Integrity against *deliberate* cheating is not a goal (solutions ship to the client, there are
no stakes); integrity against *accidental* contamination is (fresh worker + ordering above).
"""
from __future__ import annotations

import ast
import builtins
import contextlib
import copy
import io
import random
import traceback

VERSION = 1

# Friendly, varied test values: names a beginner recognises, with non-ASCII letters on purpose.
WORDS = (
    "Ada", "Grace Hopper", "Alan", "Çağla", "Ömer", "Zoë", "Linus", "Margaret",
    "Guido", "Katherine Johnson", "Hedy", "Tim", "Barış", "Python", "hello world", "x",
)
_BUILTINS_SNAPSHOT = dict(builtins.__dict__)


class ContentError(Exception):
    """The exercise itself is broken (e.g. the reference solution doesn't fit its own check)."""


# ------------------------------------------------------------------ running code
def normalise(text):
    lines = text.replace("\r\n", "\n").rstrip("\n").split("\n")
    return "\n".join(line.rstrip() for line in lines)


def error_info(exc, filename):
    info = {"type": type(exc).__name__, "message": str(exc), "lineno": None, "offset": None, "text": None}
    if isinstance(exc, SyntaxError):
        info.update(message=exc.msg, lineno=exc.lineno, offset=exc.offset, text=(exc.text or "").rstrip("\n") or None)
    else:
        frames = [f for f in traceback.extract_tb(exc.__traceback__) if f.filename == filename]
        if frames:
            info.update(lineno=frames[-1].lineno, text=frames[-1].line or None)
    if isinstance(exc, NameError):
        info["name"] = getattr(exc, "name", None)
    tb = traceback.TracebackException.from_exception(exc)
    tb.stack[:] = [f for f in tb.stack if f.filename == filename]
    info["traceback"] = "".join(tb.format())
    return info


def _restore_builtins():
    d = builtins.__dict__
    if len(d) != len(_BUILTINS_SNAPSHOT) or any(d.get(k) is not v for k, v in _BUILTINS_SNAPSHOT.items()):
        d.clear()
        d.update(_BUILTINS_SNAPSHOT)


def run(code_obj, filename, values=None):
    """Execute compiled code in a fresh namespace; capture stdout and the error (if any)."""
    namespace = {"__name__": "__main__", "__builtins__": builtins, "__file__": filename}
    if values:
        namespace.update(copy.deepcopy(values))
    buf = io.StringIO()
    err = None
    try:
        with contextlib.redirect_stdout(buf):
            exec(code_obj, namespace)
    except SystemExit:
        pass
    except KeyboardInterrupt:
        raise
    except BaseException as exc:  # noqa: BLE001 - learner code can raise anything
        err = error_info(exc, filename)
    finally:
        _restore_builtins()
    return {"stdout": buf.getvalue(), "error": err}


def same_outcome(a, b):
    a_err = a["error"]["type"] if a["error"] else None
    b_err = b["error"]["type"] if b["error"] else None
    return a_err == b_err and normalise(a["stdout"]) == normalise(b["stdout"])


# ------------------------------------------------------------------ program-with-inputs
def split_inputs(tree, names):
    """Split leading `name = value` assignments for the given input names from the rest.

    Returns (head_module, rest_module, missing_names). Order of the assignments is free.
    """
    found = set()
    idx = 0
    body = tree.body
    while idx < len(body) and len(found) < len(names):
        node = body[idx]
        if (
            isinstance(node, ast.Assign)
            and len(node.targets) == 1
            and isinstance(node.targets[0], ast.Name)
            and node.targets[0].id in names
            and node.targets[0].id not in found
        ):
            found.add(node.targets[0].id)
            idx += 1
        else:
            break
    missing = [n for n in names if n not in found]
    head = ast.Module(body=body[:idx], type_ignores=[])
    rest = ast.Module(body=body[idx:], type_ignores=[])
    return head, rest, missing


def make_value(kind, rng):
    if kind == "str":
        return rng.choice(WORDS)
    if kind == "int":
        return rng.randint(-20, 100)
    if kind == "bool":
        return rng.choice([True, False])
    raise ContentError(f"unknown random type {kind!r}")


def make_tests(check, rng):
    tests = [dict(t) for t in check.get("tests", [])]
    rnd = check.get("random") or {}
    types = rnd.get("types") or {}
    for _ in range(int(rnd.get("count", 0))):
        tests.append({name: make_value(types[name], rng) for name in sorted(types)})
    return tests


# ------------------------------------------------------------------ grading
def _new_result(kind, seed):
    return {
        "grader": VERSION, "kind": kind, "seed": seed, "passed": False, "problem": None,
        "tests_total": 0, "tests_passed": 0, "failed": None, "error": None, "misconception": None,
    }


def _compile(source_or_tree, filename):
    return compile(source_or_tree, filename, "exec", dont_inherit=True)


def _parse_reference(source, label, filename):
    try:
        return ast.parse(source, filename)
    except SyntaxError as exc:
        raise ContentError(f"{label} does not parse: {exc}") from exc


def grade(spec, code, seed, filename="/main.py"):
    """Grade learner `code` against an exercise `spec` (a bundle entry). Returns a result dict."""
    check = spec["check"]
    kind = check["kind"]
    rng = random.Random(seed)
    result = _new_result(kind, seed)

    # Everything that defines "correct" is prepared first (before any learner code runs).
    if kind == "verbatim":
        target_tree = _parse_reference(check["target"], "target", filename)
    elif kind == "stdout":
        sol_tree = _parse_reference(spec["solution"], "solution", filename)
        expected_runs = [(None, run(_compile(sol_tree, filename), filename))]
        wrong = _prepare_misconceptions(spec, filename, [None], names=None)
    elif kind == "program-with-inputs":
        names = check["inputs"]
        sol_tree = _parse_reference(spec["solution"], "solution", filename)
        sol_head, sol_rest, missing = split_inputs(sol_tree, names)
        if missing:
            raise ContentError(f"solution must start by assigning {missing}")
        sol_code = _compile(sol_rest, filename)
    else:
        raise ContentError(f"unknown check kind {kind!r}")

    # Learner code: syntax first.
    try:
        tree = ast.parse(code, filename)
    except SyntaxError as exc:
        result.update(problem="syntax", error=error_info(exc, filename))
        return result

    if kind == "verbatim":
        if ast.dump(tree) != ast.dump(target_tree):
            result.update(problem="structure-mismatch")
            return result
        actual = run(_compile(tree, filename), filename)
        result["tests_total"] = 1
        if actual["error"]:
            result.update(problem="runtime", error=actual["error"])
            return result
        result.update(passed=True, tests_passed=1)
        return result

    if kind == "stdout":
        tests = [None]
        actual_runs = [run(_compile(tree, filename), filename)]
    else:  # program-with-inputs
        head, rest, missing = split_inputs(tree, names)
        if missing:
            result.update(problem="inputs-missing", error={"type": "InputsMissing", "missing": missing, "expected_names": names})
            return result
        tests = []
        for t in make_tests(check, rng):
            if t not in tests:
                tests.append(t)
        # Reference outcomes for every authored/random test BEFORE any learner code runs.
        expected_runs = [(t, run(sol_code, filename, t)) for t in tests]
        wrong = _prepare_misconceptions(spec, filename, tests, names=names)
        # The learner's own initial values become the FIRST test (most intuitive feedback).
        # Exception to the ordering rule: their reference outcome is computed after evaluating
        # the learner's assignment expressions; builtins are restored after every run.
        own_values = _values_of(head, filename, names)
        if own_values is not None and own_values not in tests:
            tests.insert(0, own_values)
            expected_runs.insert(0, (own_values, run(sol_code, filename, own_values)))
            for m in wrong:
                m["runs"].insert(0, run(m["code"], filename, own_values))
        learner_code = _compile(rest, filename)
        actual_runs = [run(learner_code, filename, t) for t in tests]

    result["tests_total"] = len(tests)
    first_fail = None
    for (t, exp), act in zip(expected_runs, actual_runs):
        if same_outcome(exp, act):
            result["tests_passed"] += 1
        elif first_fail is None:
            first_fail = {"inputs": t, "expected": exp["stdout"], "actual": act["stdout"], "error": act["error"]}
    if first_fail is None:
        result["passed"] = True
        return result

    result["failed"] = first_fail
    result["problem"] = "runtime" if first_fail["error"] else "wrong-output"
    if first_fail["error"]:
        result["error"] = first_fail["error"]
    for m in wrong:
        if all(same_outcome(w, a) for w, a in zip(m["runs"], actual_runs)):
            result["misconception"] = {"id": m["id"], "message": m["message"]}
            break
    return result


def reference_outcomes(spec, seed, filename="/main.py"):
    """[(inputs, outcome)] of the reference (solution / verbatim target) on every generated test.

    Used by the content pipeline: a reference that *raises* would still "match itself" in
    grade(), so it must be rejected separately.
    """
    check = spec["check"]
    if check["kind"] == "verbatim":
        return [(None, run(_compile(_parse_reference(check["target"], "target", filename), filename), filename))]
    sol_tree = _parse_reference(spec["solution"], "solution", filename)
    if check["kind"] == "stdout":
        return [(None, run(_compile(sol_tree, filename), filename))]
    head, rest, missing = split_inputs(sol_tree, check["inputs"])
    if missing:
        raise ContentError(f"solution must start by assigning {missing}")
    code_obj = _compile(rest, filename)
    return [(t, run(code_obj, filename, t)) for t in make_tests(check, random.Random(seed))]


def _values_of(head, filename, names):
    ns = {"__builtins__": builtins}
    try:
        exec(_compile(head, filename), ns)
    except Exception:  # noqa: BLE001
        return None
    finally:
        _restore_builtins()
    values = {n: ns[n] for n in names if n in ns}
    try:
        copy.deepcopy(values)
    except Exception:  # noqa: BLE001 - values must be copyable to be reused as test inputs
        return None
    return values


def _prepare_misconceptions(spec, filename, tests, names):
    prepared = []
    for m in spec.get("misconceptions", []):
        tree = _parse_reference(m["program"], f"misconception program {m['id']}", filename)
        if names is None:
            code_obj = _compile(tree, filename)
        else:
            _, rest, missing = split_inputs(tree, names)
            if missing:
                raise ContentError(f"misconception program {m['id']} must start by assigning {missing}")
            code_obj = _compile(rest, filename)
        prepared.append({"id": m["id"], "message": m["message"], "code": code_obj, "runs": [run(code_obj, filename, t) for t in tests]})
    return prepared
