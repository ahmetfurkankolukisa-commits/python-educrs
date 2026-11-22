#!/usr/bin/env python3
"""Content pipeline (docs/05-f3-mvp0.md §2.3).

Reads content/en/exercises/<concept>/<slug>/exercise.toml (+ .py files), validates them,
EXECUTES them with the real grader, and writes:
  content/build/exercises.json      the bundle the app ships (generated — never hand-edit)
  content/golden/<concept>/<slug>.json   what a learner would see for the solution, the starter
                                         and every misconception program (diffable in PRs)

Runs unchanged under Pyodide-in-Node (tools/content/run-pipeline.mjs — the browser's exact
Python, used to WRITE) and CPython (`--check` parity in CI when the minor versions match).

Usage: pipeline.py [--root DIR] [--check]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import tomllib
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent.parent / "packages" / "grader"))
import educrs_grader as grader  # noqa: E402

sys.path.insert(0, str(HERE))
import readability  # noqa: E402

ID_RE = re.compile(r"^ex:([a-z][a-z0-9]*(?:\.[a-z0-9][a-z0-9-]*)+)/([a-z0-9][a-z0-9-]*)$")
SOURCE_RE = re.compile(r"^(original|futurecoder@[0-9a-f]{7,40})$")
TYPES = {"code", "verbatim", "predict-output", "fill-gap"}
DIFFICULTIES = {"easy", "medium", "hard"}
CHECK_KINDS = {"stdout", "program-with-inputs"}
RANDOM_TYPES = {"str", "int", "bool"}
VALIDATION_SEEDS = range(1, 11)  # the solution must pass for every one of these
GOLDEN_SEED = 1
ERROR_OPTION = "Error"
MIN_HINTS = {"code": 2, "verbatim": 1, "predict-output": 0, "fill-gap": 0}
GAP = "____"
LESSON_MIN_EXERCISES = 3
MIN_ITEMS_PER_CONCEPT = 5  # every concept with a lesson (plan §3.7); projects are exempt
# 2 (F3.5): lessons carry `module`, the bundle carries `path`, predict option misconceptions are { id, message }.
BUNDLE_SCHEMA = 2
PYTHON = "%d.%d" % sys.version_info[:2]


class Report:
    def __init__(self):
        self.errors = []
        self.warnings = []
        self.readability = {}  # lesson id -> readability.measure() result (printed with --readability)

    def error(self, where, code, msg):
        self.errors.append((where, code, msg))

    def warn(self, where, code, msg):
        self.warnings.append((where, code, msg))


def dump(obj):
    return json.dumps(obj, indent=2, sort_keys=True, ensure_ascii=False) + "\n"


# ------------------------------------------------------------------ loading
def load_catalog(root):
    with open(root / "content" / "concepts.toml", "rb") as f:
        data = tomllib.load(f)
    return {c["id"] for c in data["concept"]}, {m["id"] for m in data["misconception"]}


def load_projects(root):
    """[[project]] entries: id -> {module, requires}. A project is taught like a lesson (§16.3)."""
    with open(root / "content" / "concepts.toml", "rb") as f:
        data = tomllib.load(f)
    return {p["id"]: {"module": p["module"], "requires": list(p.get("requires", []))} for p in data.get("project", [])}


def load_misconception_concepts(root):
    """Misconception id -> the concepts it belongs to."""
    with open(root / "content" / "concepts.toml", "rb") as f:
        data = tomllib.load(f)
    return {m["id"]: list(m.get("concepts", [])) for m in data["misconception"]}


def load_path_order(root):
    """Modules in catalog order with titles, and each concept's (module, position).

    A project sits right after the last concept of its module (positions are only compared).
    """
    with open(root / "content" / "concepts.toml", "rb") as f:
        data = tomllib.load(f)
    modules = [{"id": m["id"], "title": m["title"]} for m in data["module"]]
    place = {c["id"]: (c["module"], i) for i, c in enumerate(data["concept"])}
    for p in data.get("project", []):
        last = max((i for mod, i in place.values() if mod == p["module"]), default=-1)
        place[p["id"]] = (p["module"], last + 0.5)
    return modules, place


def read_text(folder, rel, where, report):
    p = folder / rel
    if not p.is_file():
        report.error(where, "missing-file", f"{rel} not found")
        return None
    return p.read_text(encoding="utf-8")


def _str(d, key, where, report, required=True):
    v = d.get(key)
    if v is None:
        if required:
            report.error(where, "missing-field", f"`{key}` is required")
        return None
    if not isinstance(v, str) or not v.strip():
        report.error(where, "bad-field", f"`{key}` must be a non-empty string")
        return None
    return v


def build_entry(root, path, concepts, misconceptions, report):
    folder = path.parent
    where = str(path.relative_to(root))
    try:
        with open(path, "rb") as f:
            d = tomllib.load(f)
    except tomllib.TOMLDecodeError as exc:
        report.error(where, "toml", str(exc))
        return None

    eid = _str(d, "id", where, report)
    concept = _str(d, "concept", where, report)
    etype = _str(d, "type", where, report)
    if eid:
        m = ID_RE.match(eid)
        if not m:
            report.error(where, "bad-id", f"id {eid!r} must look like ex:<concept>/<slug>")
        else:
            where = eid
            if concept and m.group(1) != concept:
                report.error(where, "id-concept-mismatch", f"id concept {m.group(1)!r} != concept {concept!r}")
            if (folder.parent.name, folder.name) != (m.group(1), m.group(2)):
                report.error(where, "folder-mismatch", f"must live in exercises/{m.group(1)}/{m.group(2)}/")
    if concept and concept not in concepts:
        report.error(where, "unknown-concept", f"concept {concept!r} is not in concepts.toml")
    if etype and etype not in TYPES:
        report.error(where, "bad-type", f"type must be one of {sorted(TYPES)}")
        return None
    difficulty = d.get("difficulty")
    if difficulty not in DIFFICULTIES:
        report.error(where, "bad-difficulty", f"difficulty must be one of {sorted(DIFFICULTIES)}")
    source = d.get("source", "original")
    if not isinstance(source, str) or not SOURCE_RE.match(source):
        report.error(where, "bad-source", "source must be 'original' or 'futurecoder@<sha>'")

    hints = d.get("hints", [])
    if not isinstance(hints, list) or not all(isinstance(h, dict) and isinstance(h.get("text"), str) and h["text"].strip() for h in hints):
        report.error(where, "bad-hints", "hints must be [[hints]] tables with a non-empty `text`")
        hints = []
    if etype and len(hints) < MIN_HINTS[etype]:
        report.error(where, "too-few-hints", f"{etype} exercises need at least {MIN_HINTS[etype]} hint(s)")

    entry = {
        "id": eid, "concept": concept, "type": etype, "difficulty": difficulty,
        "title": _str(d, "title", where, report), "prompt": _str(d, "prompt", where, report),
        "source": source, "hints": [h["text"].strip() for h in hints],
    }
    if etype is None or eid is None:
        return None

    if etype == "code":
        entry["starter"] = read_text(folder, d.get("starter", "starter.py"), where, report)
        entry["solution"] = read_text(folder, d.get("solution", "solution.py"), where, report)
        entry["check"] = _check(d.get("check"), where, report)
        entry["misconceptions"] = _misconceptions(d.get("misconceptions", []), folder, misconceptions, where, report)
    elif etype == "verbatim":
        target = read_text(folder, d.get("target", "target.py"), where, report)
        entry["starter"] = read_text(folder, d["starter"], where, report) if "starter" in d else ""
        entry["check"] = {"kind": "verbatim", "target": target}
    elif etype == "predict-output":
        program = read_text(folder, d.get("program", "program.py"), where, report)
        options = d.get("options")
        if not isinstance(options, list) or len(options) < 2 or not all(isinstance(o, str) for o in options):
            report.error(where, "bad-options", "options must list at least 2 strings")
            options = []
        if len(set(grader.normalise(o) for o in options)) != len(options):
            report.error(where, "duplicate-options", "options must be distinct")
        if options and ERROR_OPTION not in options:
            options = options + [ERROR_OPTION]
        om = _tagged(d.get("option_misconceptions", {}), options, misconceptions, where, report,
                     what="option", bad="bad-option-misconceptions", unknown="unknown-option")
        entry["predict"] = {
            "program": program, "options": options, "option_misconceptions": om,
            "explanation": _str(d, "explanation", where, report),
        }
    else:  # fill-gap (docs/05-f3-mvp0.md §13.4)
        entry["fill"] = _fill_gap(d, misconceptions, where, report)
    return entry


def _fill_gap(d, catalog, where, report):
    template = _str(d, "template", where, report)
    if template is not None and template.count(GAP) != 1:
        report.error(where, "bad-gap", f"template must contain exactly one {GAP}")
    tiles = d.get("tiles")
    if not isinstance(tiles, list) or len(tiles) < 2 or not all(isinstance(t, str) and t.strip() for t in tiles):
        report.error(where, "bad-tiles", "tiles must list at least 2 non-empty strings")
        tiles = []
    if len(set(tiles)) != len(tiles):
        report.error(where, "duplicate-tiles", "tiles must be distinct")
    answer = d.get("answer")
    if answer not in tiles:
        report.error(where, "answer-not-in-tiles", "answer must be one of the tiles")
    tm = d.get("tile_misconceptions", {})
    if isinstance(tm, dict) and answer in tm:
        report.error(where, "correct-tile-has-misconception", "the answer tile cannot be tagged with a misconception")
    clean = _tagged(tm, tiles, catalog, where, report, what="tile", bad="bad-tile-misconceptions", unknown="unknown-tile")
    return {
        "template": template, "tiles": tiles, "answer": answer,
        "explanation": _str(d, "explanation", where, report),
        "tile_misconceptions": dict(sorted(clean.items())),
    }


def _tagged(mapping, keys, catalog, where, report, what, bad, unknown):
    """Wrong answers (tiles / options) tagged with a misconception: `{ id, message }` each.

    The message is what the learner sees (catalog `belief` text is for authors, not learners).
    """
    if not isinstance(mapping, dict):
        report.error(where, bad, f"{what}_misconceptions must map a {what} to {{ id, message }}")
        return {}
    clean = {}
    for key, v in mapping.items():
        if key not in keys:
            report.error(where, unknown, f"{what}_misconceptions refers to {key!r}, which is not a {what}")
        if not (isinstance(v, dict) and isinstance(v.get("id"), str) and isinstance(v.get("message"), str) and v["message"].strip()):
            report.error(where, bad, f"{key!r}: expected {{ id = \"mc.…\", message = \"…\" }}")
            continue
        if v["id"] not in catalog:
            report.error(where, "unknown-misconception", f"{v['id']!r} is not in the concepts.toml catalog")
        clean[key] = {"id": v["id"], "message": v["message"].strip()}
    return dict(sorted(clean.items()))


def _check(c, where, report):
    if not isinstance(c, dict):
        report.error(where, "missing-check", "[check] table is required for code exercises")
        return None
    kind = c.get("kind")
    if kind not in CHECK_KINDS:
        report.error(where, "bad-check-kind", f"check.kind must be one of {sorted(CHECK_KINDS)}")
        return None
    out = {"kind": kind}
    if kind == "program-with-inputs":
        inputs = c.get("inputs")
        if not isinstance(inputs, list) or not inputs or not all(isinstance(i, str) and i.isidentifier() for i in inputs):
            report.error(where, "bad-inputs", "check.inputs must list variable names")
            return None
        out["inputs"] = inputs
        tests = c.get("tests", [])
        if not isinstance(tests, list) or not all(isinstance(t, dict) and set(t) == set(inputs) for t in tests):
            report.error(where, "bad-tests", "each test must give a value for exactly the inputs")
            tests = []
        out["tests"] = tests
        rnd = c.get("random")
        if rnd is not None:
            types = rnd.get("types", {}) if isinstance(rnd, dict) else None
            count = rnd.get("count") if isinstance(rnd, dict) else None
            if not isinstance(types, dict) or set(types) != set(inputs) or not all(t in RANDOM_TYPES for t in types.values()):
                report.error(where, "bad-random", f"check.random.types must give a type ({sorted(RANDOM_TYPES)}) for every input")
            elif not isinstance(count, int) or not 1 <= count <= 20:
                report.error(where, "bad-random", "check.random.count must be an integer between 1 and 20")
            else:
                out["random"] = {"count": count, "types": dict(sorted(types.items()))}
        if not out["tests"] and "random" not in out:
            report.error(where, "no-tests", "program-with-inputs needs check.tests and/or check.random")
    return out


def _misconceptions(items, folder, catalog, where, report):
    out = []
    if not isinstance(items, list):
        report.error(where, "bad-misconceptions", "misconceptions must be [[misconceptions]] tables")
        return out
    for m in items:
        mid, prog, msg = m.get("id"), m.get("program"), m.get("message")
        if mid not in catalog:
            report.error(where, "unknown-misconception", f"{mid!r} is not in the concepts.toml catalog")
        if not isinstance(msg, str) or not msg.strip():
            report.error(where, "bad-misconception", f"{mid}: message is required")
        program = read_text(folder, prog, where, report) if isinstance(prog, str) else None
        if program is None and not isinstance(prog, str):
            report.error(where, "bad-misconception", f"{mid}: program (a file with the wrong program) is required")
        out.append({"id": mid, "program": program, "message": (msg or "").strip()})
    return out


# ------------------------------------------------------------------ executing
def execute(entry, report):
    """Run the exercise with the real grader; return its golden record (or None)."""
    eid = entry["id"]
    try:
        if entry["type"] == "predict-output":
            return _execute_predict(entry, report)
        if entry["type"] == "fill-gap":
            return _execute_fill(entry, report)
        golden = {}
        ref = entry["solution"] if entry["type"] == "code" else entry["check"]["target"]
        for seed in VALIDATION_SEEDS:
            for inputs, outcome in grader.reference_outcomes(entry, seed):
                if outcome["error"]:
                    report.error(eid, "solution-raises", f"reference raises {outcome['error']['type']} for inputs {inputs} (seed {seed})")
                    return None
            r = grader.grade(entry, ref, seed)
            if not r["passed"]:
                report.error(eid, "solution-fails", f"reference does not pass with seed {seed}: {r['problem']} {r['failed'] or r['error']}")
                return None
        golden["solution"] = grader.grade(entry, ref, GOLDEN_SEED)
        starter = entry.get("starter") or ""
        if entry["type"] == "code" or starter.strip():
            r = grader.grade(entry, starter, GOLDEN_SEED)
            if r["passed"]:
                report.error(eid, "starter-passes", "the starter code already passes; the exercise tests nothing")
            golden["starter"] = r
        golden["misconceptions"] = {}
        for m in entry.get("misconceptions", []):
            r = grader.grade(entry, m["program"], GOLDEN_SEED)
            got = (r["misconception"] or {}).get("id")
            if got != m["id"]:
                report.error(eid, "misconception-not-triggered", f"program for {m['id']} produced {got!r} ({r['problem']})")
            golden["misconceptions"][m["id"]] = r
        return golden
    except grader.ContentError as exc:
        report.error(eid, "content-error", str(exc))
        return None


def run_program(source):
    """Outcome of a whole program, including the case where it does not even compile."""
    try:
        code = compile(source, "/main.py", "exec", dont_inherit=True)
    except SyntaxError as exc:
        return {"stdout": "", "error": grader.error_info(exc, "/main.py")}
    return grader.run(code, "/main.py")


def _execute_fill(entry, report):
    """Run the template with EVERY tile. The answer must run cleanly and no other tile may give the
    same result (otherwise the question is ambiguous). Feedback for wrong tiles is computed here."""
    eid, f = entry["id"], entry["fill"]
    outcomes = {t: run_program(f["template"].replace(GAP, t)) for t in f["tiles"]}
    ans = outcomes[f["answer"]]
    if ans["error"]:
        report.error(eid, "answer-raises", f"the program with the answer tile raises {ans['error']['type']}")
        return None
    feedback = {}
    for tile, o in outcomes.items():
        if tile == f["answer"]:
            continue
        if grader.same_outcome(o, ans):
            report.error(eid, "ambiguous-tiles", f"tile {tile!r} gives the same result as the answer {f['answer']!r}")
        if o["error"]:
            program = f["template"].replace(GAP, tile)
            feedback[tile] = {"error": o["error"]["type"], "explanation": grader.educrs_explain.explain(o["error"], program)}
        else:
            feedback[tile] = {"output": o["stdout"]}
    f["expected_output"] = ans["stdout"]
    f["tile_feedback"] = dict(sorted(feedback.items()))
    return {"answer": f["answer"], "outcomes": outcomes}


def _execute_predict(entry, report):
    eid, p = entry["id"], entry["predict"]
    if p["program"] is None:
        return None
    outcome = run_program(p["program"])
    answer = ERROR_OPTION if outcome["error"] else grader.normalise(outcome["stdout"])
    normalised = {grader.normalise(o): o for o in p["options"]}
    if answer not in normalised:
        report.error(eid, "answer-not-in-options", f"the program prints {answer!r}, which is not one of the options")
    else:
        p["answer"] = normalised[answer]
        if p["answer"] in p["option_misconceptions"]:
            report.error(eid, "correct-option-has-misconception", "the correct option cannot be tagged with a misconception")
    return {"answer": answer, "outcome": outcome}


def content_hash(entry):
    data = {k: v for k, v in entry.items() if k != "contentHash"}
    return hashlib.sha256(json.dumps(data, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:16]


# ------------------------------------------------------------------ lessons (§13.2)
def build_lessons(root, entries, concepts, report, place=None):
    lroot = root / "content" / "en" / "lessons"
    paths = sorted(lroot.glob("*.toml")) if lroot.is_dir() else []
    by_id = {e["id"]: e for e in entries}
    used = {}
    lessons = []
    for path in paths:
        where = str(path.relative_to(root))
        try:
            with open(path, "rb") as fh:
                d = tomllib.load(fh)
        except tomllib.TOMLDecodeError as exc:
            report.error(where, "toml", str(exc))
            continue
        concept = _str(d, "concept", where, report)
        title = _str(d, "title", where, report)
        if concept and concept not in concepts:
            report.error(where, "unknown-concept", f"concept {concept!r} is not in concepts.toml")
        if concept and path.stem != concept:
            report.error(where, "lesson-file-mismatch", f"file must be named {concept}.toml")
        steps = d.get("steps")
        if not isinstance(steps, list) or not steps:
            report.error(where, "no-steps", "a lesson needs [[steps]]")
            continue
        out, exercises = [], 0
        for i, st in enumerate(steps, 1):
            kind = st.get("kind") if isinstance(st, dict) else None
            if kind == "explain":
                text = st.get("text")
                if not isinstance(text, str) or not text.strip():
                    report.error(where, "bad-step", f"step {i}: explain needs a non-empty `text`")
                    continue
                step = {"kind": "explain", "text": text.strip()}
                example = st.get("example")
                if example is not None:
                    if not isinstance(example, str) or not example.strip():
                        report.error(where, "bad-step", f"step {i}: `example` must be a non-empty string")
                    else:
                        o = run_program(example)
                        if o["error"]:
                            report.error(where, "example-raises", f"step {i}: example raises {o['error']['type']}")
                        step.update(example=example, example_output=o["stdout"])
                out.append(step)
            elif kind == "exercise":
                eid = st.get("id")
                e = by_id.get(eid)
                if e is None:
                    report.error(where, "unknown-exercise", f"step {i}: no exercise {eid!r}")
                elif e["concept"] != concept:
                    report.error(where, "exercise-wrong-concept", f"step {i}: {eid} belongs to {e['concept']}")
                if eid in used:
                    report.error(where, "exercise-reused", f"step {i}: {eid} is already used in {used[eid]}")
                else:
                    used[eid] = where
                exercises += 1
                out.append({"kind": "exercise", "id": eid})
            else:
                report.error(where, "bad-step-kind", f"step {i}: kind must be 'explain' or 'exercise'")
        first = steps[0].get("kind") if isinstance(steps[0], dict) else None
        last = steps[-1].get("kind") if isinstance(steps[-1], dict) else None
        if first != "explain":
            report.error(where, "first-step-not-explain", "a lesson starts with an explain step")
        if last != "exercise":
            report.error(where, "last-step-not-exercise", "a lesson ends with an exercise step")
        if exercises < LESSON_MIN_EXERCISES:
            report.error(where, "too-few-exercises", f"{exercises} exercise step(s); a lesson needs at least {LESSON_MIN_EXERCISES}")
        lesson = {"id": f"lesson:{concept}", "concept": concept, "module": (place or {}).get(concept, (None, 0))[0],
                  "title": title, "steps": out}
        lesson["contentHash"] = content_hash(lesson)
        lessons.append(lesson)
    with_lesson = {l["concept"] for l in lessons}
    for c in sorted({e["concept"] for e in entries} - with_lesson):
        report.warn(c, "no-lesson", "has exercises but no lesson manifest yet (F3.7)")
    return sorted(lessons, key=lambda l: l["id"])


def learner_texts(entry):
    """Every piece of prose a learner reads for one exercise."""
    texts = [entry["prompt"], *entry["hints"]]
    if entry["type"] == "predict-output":
        p = entry["predict"]
        texts += [p["explanation"], *(m["message"] for m in p["option_misconceptions"].values())]
    elif entry["type"] == "fill-gap":
        f = entry["fill"]
        texts += [f["explanation"], *(m["message"] for m in f["tile_misconceptions"].values())]
    elif entry["type"] == "code":
        texts += [m["message"] for m in entry["misconceptions"]]
    return [t for t in texts if t]


def taught_misconceptions(entry):
    if entry["type"] == "predict-output":
        return {m["id"] for m in entry["predict"]["option_misconceptions"].values()}
    if entry["type"] == "fill-gap":
        return {m["id"] for m in entry["fill"]["tile_misconceptions"].values()}
    if entry["type"] == "code":
        return {m["id"] for m in entry["misconceptions"]}
    return set()


def check_lessons(root, lessons, entries, projects, mc_concepts, place, report):
    """Coverage, misconception coverage, readability and project order (§16.4)."""
    lroot = root / "content" / "en" / "lessons"
    by_id = {e["id"]: e for e in entries}
    for lesson in lessons:
        concept = lesson["concept"]
        where = str((lroot / f"{concept}.toml").relative_to(root))
        mine = [e for e in entries if e["concept"] == concept]
        if concept in projects:
            req = projects[concept]["requires"]
            late = [c for c in req if c in place and place[c][1] > place[concept][1]]
            if late:
                report.error(where, "project-before-requirement", f"comes before the concepts it requires: {', '.join(late)}")
        else:
            if len(mine) < MIN_ITEMS_PER_CONCEPT:
                report.error(where, "too-few-items", f"{concept} has {len(mine)} exercise(s); every concept with a lesson needs at least {MIN_ITEMS_PER_CONCEPT}")
            taught = set().union(*(taught_misconceptions(e) for e in mine)) if mine else set()
            for mc in sorted(m for m, cs in mc_concepts.items() if concept in cs and m not in taught):
                report.error(where, "misconception-not-taught", f"{mc} belongs to {concept} but no exercise of it uses {mc}")
        texts = []
        for step in lesson["steps"]:
            if step["kind"] == "explain":
                texts.append(step["text"])
            elif step["id"] in by_id:
                texts += learner_texts(by_id[step["id"]])
        m = readability.measure(texts)
        if m["ease"] is not None and m["ease"] < readability.MIN_EASE:
            report.error(where, "hard-to-read", f"Flesch reading ease {m['ease']} < {readability.MIN_EASE}: use shorter sentences and shorter words")
        if m["longest"] > readability.MAX_SENTENCE_WORDS:
            report.error(where, "long-sentence", f"{m['longest']} words (max {readability.MAX_SENTENCE_WORDS}): {m['longest_sentence']!r}")
        report.readability[lesson["id"]] = m


def build_path(modules, place, lessons):
    """Learning path (§13.6): modules in catalog order, each with its lessons in concept order.

    Only concepts that have a lesson appear; modules without lessons are left out.
    """
    order = sorted((l for l in lessons if l["concept"] in place), key=lambda l: place[l["concept"]][1])
    path = []
    for m in modules:
        ids = [l["id"] for l in order if l["module"] == m["id"]]
        if ids:
            path.append({"module": m["id"], "title": m["title"], "lessons": ids})
    return path


# ------------------------------------------------------------------ build
def build(root):
    report = Report()
    concepts, misconceptions = load_catalog(root)
    projects = load_projects(root)
    concepts = concepts | set(projects)
    ex_root = root / "content" / "en" / "exercises"
    paths = sorted(ex_root.glob("*/*/exercise.toml")) if ex_root.is_dir() else []
    entries, goldens, seen = [], {}, {}
    for path in paths:
        errors_before = len(report.errors)
        entry = build_entry(root, path, concepts, misconceptions, report)
        if entry is None:
            continue
        if entry["id"] in seen:
            report.error(entry["id"], "duplicate-id", f"also defined in {seen[entry['id']]}")
            continue
        seen[entry["id"]] = str(path.relative_to(root))
        # Only execute exercises that are statically valid (missing files etc. would crash the grader).
        golden = execute(entry, report) if len(report.errors) == errors_before else None
        if golden is not None:
            goldens[entry["id"]] = golden
        entry["contentHash"] = content_hash(entry)
        entries.append(entry)
    modules, place = load_path_order(root)
    lessons = build_lessons(root, entries, concepts, report, place)
    check_lessons(root, lessons, entries, projects, load_misconception_concepts(root), place, report)
    bundle = {
        "schema": BUNDLE_SCHEMA, "grader": grader.VERSION, "python": PYTHON,
        "exercises": sorted(entries, key=lambda e: e["id"]),
        "lessons": lessons,
        "path": build_path(modules, place, lessons),
    }
    return bundle, goldens, report


def golden_path(root, eid):
    concept, slug = ID_RE.match(eid).groups()
    return root / "content" / "golden" / concept / f"{slug}.json"


def outputs(root, bundle, goldens):
    files = {root / "content" / "build" / "exercises.json": dump(bundle)}
    for eid, g in goldens.items():
        files[golden_path(root, eid)] = dump({"id": eid, "grader": grader.VERSION, "python": PYTHON, **g})
    return files


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=str(HERE.parent.parent))
    ap.add_argument("--check", action="store_true", help="fail if generated files differ from the committed ones")
    ap.add_argument("--readability", action="store_true", help="print each lesson's reading ease and longest sentence")
    args = ap.parse_args(argv)
    root = Path(args.root).resolve()

    bundle, goldens, report = build(root)
    if args.readability:
        for lid, m in sorted(report.readability.items(), key=lambda kv: kv[1]["ease"] or 0):
            print(f"READ   {lid:<34} ease {m['ease']:>5}  longest {m['longest']:>2} words  ({m['sentences']} sentences)")
    for where, code, msg in report.errors:
        print(f"ERROR  {where}  [{code}] {msg}")
    for where, code, msg in report.warnings:
        print(f"WARN   {where}  [{code}] {msg}")
    n = len(bundle["exercises"])
    print(f"{'OK' if not report.errors else 'FAILED'}    {n} exercise(s), Python {PYTHON}, grader v{grader.VERSION}")
    if report.errors:
        return 1

    files = outputs(root, bundle, goldens)
    golden_dir = root / "content" / "golden"
    existing_golden = set(golden_dir.glob("*/*.json")) if golden_dir.is_dir() else set()
    stale = sorted(existing_golden - set(files))

    if args.check:
        committed = root / "content" / "build" / "exercises.json"
        committed_python = json.loads(committed.read_text(encoding="utf-8")).get("python") if committed.is_file() else None
        if committed_python and committed_python != PYTHON:
            print(f"SKIP   output comparison: files were generated with Python {committed_python}, this is {PYTHON} (validation above still ran)")
            return 0
        diffs = [str(p.relative_to(root)) for p, text in files.items() if not p.is_file() or p.read_text(encoding="utf-8") != text]
        diffs += [f"{p.relative_to(root)} (stale)" for p in stale]
        if diffs:
            print("FAILED generated content is out of date — run `pnpm content`:")
            for d in diffs:
                print(f"         {d}")
            return 1
        print("OK     generated files are up to date")
        return 0

    for p, text in files.items():
        p.parent.mkdir(parents=True, exist_ok=True)
        if not p.is_file() or p.read_text(encoding="utf-8") != text:
            p.write_text(text, encoding="utf-8")
    for p in stale:
        p.unlink()
    print(f"WROTE  content/build/exercises.json + {len(goldens)} golden file(s)" + (f", removed {len(stale)} stale" if stale else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
