"""Negative tests: deliberately broken graphs MUST be rejected with the right error.

Run: python3 tools/tests/test_concept_graph.py   (stdlib only; exits 1 on failure)
"""
import importlib.util
import re
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("cg", ROOT / "tools" / "concept_graph.py")
cg = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cg)
BASE = (ROOT / "content" / "concepts.toml").read_text(encoding="utf-8")


def set_prereqs(src: str, cid: str, new: str) -> str:
    out, n = re.subn(r'(id = "%s"\n(?:.*\n)*?prereqs = )\[.*\]' % re.escape(cid), r"\g<1>" + new, src, count=1)
    assert n == 1, cid
    return out


# (name, broken source, substring the FIRST error must contain)
CASES = [
    ("cycle", set_prereqs(BASE, "intro.run-code", '["intro.program", "vars.assign"]'), "cycle: "),
    ("later module", set_prereqs(BASE, "comments.basic", '["lists.literal"]'), "depends on later module"),
    ("track dependency", set_prereqs(BASE, "loops.nested", '["loops.range", "gfx.turtle-loops"]'), "optional track"),
    ("unknown prereq", set_prereqs(BASE, "vars.use", '["vars.asign"]'), "unknown prereq"),
    ("self loop", set_prereqs(BASE, "vars.use", '["vars.use"]'), "depends on itself"),
    ("redundant edge", set_prereqs(BASE, "vars.reassign", '["vars.use", "vars.assign"]'), "redundant prereq"),
    ("second root", set_prereqs(BASE, "comments.basic", "[]"), "roots must be exactly"),
    ("duplicate id", BASE.replace('id = "vars.naming"', 'id = "vars.use"'), "duplicate id"),
    ("bad id format", BASE.replace('id = "vars.naming"', 'id = "Vars Naming"'), "bad concept id"),
    ("project too early", BASE.replace('requires = ["cond.elif", "io.input-number"]',
                                       'requires = ["cond.elif", "lists.literal"]'), "requires later concept"),
    ("bad detect kind", BASE.replace('detect = "predict"', 'detect = "guess"', 1), "detect must be one of"),
    ("unknown mc concept", BASE.replace('concepts = ["cond.if"]', 'concepts = ["cond.iff"]'), "unknown concept"),
]


def run(src: str) -> "cg.Report":
    with tempfile.NamedTemporaryFile("w", suffix=".toml", delete=False, encoding="utf-8") as f:
        f.write(src)
    cg.DATA = Path(f.name)
    r = cg.Report()
    cg.validate(cg.load(), r)
    Path(f.name).unlink()
    return r


def main() -> int:
    failed = 0
    r = run(BASE)
    if r.errors:
        print(f"FAIL  real graph has errors: {r.errors[:3]}")
        failed += 1
    else:
        print("PASS  real graph is valid")
    for name, src, expect in CASES:
        r = run(src)
        first = r.errors[0] if r.errors else ""
        if expect in first:
            print(f"PASS  {name:18s} -> {first}")
        else:
            print(f"FAIL  {name:18s} expected {expect!r}, got {first!r}")
            failed += 1
    print(f"\n{len(CASES) + 1 - failed}/{len(CASES) + 1} passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
