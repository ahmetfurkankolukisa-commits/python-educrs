"""Tests for packages/grader/educrs_explain.py — one triggering program per rule.

Runs in CPython (any 3.11+) and in Pyodide (tools/tests/run-unittests-pyodide.mjs), so every
rule is proven on the browser's Python too. Assertions never depend on exception messages.
"""
import json
import os
import re
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "packages", "grader"))
import educrs_explain as ex  # noqa: E402
import educrs_grader as g  # noqa: E402

MAIN = "/main.py"


def explain(code):
    try:
        compiled = compile(code, MAIN, "exec", dont_inherit=True)
    except SyntaxError as exc:
        return ex.explain(g.error_info(exc, MAIN), code)
    outcome = g.run(compiled, MAIN)
    assert outcome["error"], f"expected an error from {code!r}"
    return ex.explain(outcome["error"], code)


# (label, program, expected id, expected params subset, expected lineno or None)
CASES = [
    ("smart quotes", "print(“Hi”)", "syntax.smart-quotes", {"char": "“"}, 1),
    ("unterminated string", 'print("Hi)', "syntax.unterminated-string", {"quote": '"'}, 1),
    ("print without brackets (text)", 'print "hi"', "syntax.print-no-parens", {}, 1),
    ("print without brackets (name)", "name = 'x'\nprint name", "syntax.print-no-parens", {}, 2),
    ("missing closing bracket", 'print("Hi"', "syntax.unbalanced-brackets", {"char": "(", "missing": ")"}, 1),
    ("extra closing bracket", 'print("Hi"))', "syntax.unbalanced-brackets", {"char": ")", "missing": "("}, 1),
    ("assignment the wrong way round", '"Ada" = name', "syntax.assign-to-literal", {"name": "name", "value": '"Ada"'}, 1),
    ("keyword as a name", 'class = "A"', "syntax.keyword-name", {"name": "class"}, 1),
    ("space in a name", 'my name = "Ada"', "syntax.bad-name", {"name": "my name", "suggestion": "my_name"}, 1),
    ("name starts with a digit", '2name = "Ada"', "syntax.bad-name", {"name": "2name", "suggestion": "name2"}, 1),
    ("words without quotes", "print(Hello world)", "syntax.missing-quotes", {"text": "Hello world"}, 1),
    ("missing comma", 'name = "x"\nprint("Hi" name)', "syntax.missing-comma", {"left": '"Hi"', "right": "name"}, 2),
    ("something else", "x = = 1", "syntax.generic", {}, 1),
    ("unexpected indent", "x = 1\n  print(x)", "indent.unexpected", {}, 2),
    ("capital letter (builtin)", 'Print("hi")', "name.case", {"name": "Print", "suggestion": "print"}, 1),
    ("capital letter (variable)", 'name = "Ada"\nprint(Name)', "name.case", {"name": "Name", "suggestion": "name"}, 2),
    ("used before assignment", 'print(name)\nname = "Ada"', "name.before-assign", {"name": "name", "line": 2}, 1),
    ("typo in a variable", 'name = "Ada"\nprint(nmae)', "name.typo", {"name": "nmae", "suggestion": "name"}, 2),
    ("typo in print", 'pritn("x")', "name.typo", {"name": "pritn", "suggestion": "print"}, 1),
    ("text without quotes", "print(Hello)", "name.missing-quotes", {"name": "Hello"}, 1),
    ("unknown name", "x = foo", "name.undefined", {"name": "foo"}, 1),
    ("print replaced by a value", 'print = "hello"\nprint("hi")', "type.shadowed-builtin", {"name": "print", "line": 1}, 2),
    ("other runtime error", "x = 1 / 0", "runtime.generic", {"type": "ZeroDivisionError"}, 1),
]


class ExplainRules(unittest.TestCase):
    def test_cases(self):
        for label, code, eid, params, lineno in CASES:
            with self.subTest(label):
                r = explain(code)
                self.assertEqual(r["id"], eid, f"{label}: {r}")
                for k, v in params.items():
                    self.assertEqual(r["params"].get(k), v, f"{label}: param {k} in {r}")
                if lineno is not None:
                    self.assertEqual(r["lineno"], lineno, label)

    def test_every_rule_has_a_triggering_program(self):
        self.assertEqual({eid for _, _, eid, _, _ in CASES}, set(ex.IDS))


class NoFalseAlarms(unittest.TestCase):
    def test_adjacent_strings_are_valid_python(self):
        # "a" "b" is implicit concatenation: not an error, so nothing to explain.
        compile('print("a" "b")', MAIN, "exec")

    def test_lowercase_unknown_name_inside_expression_is_not_called_text(self):
        r = explain('print("Hello" + nam)')
        self.assertIn(r["id"], {"name.undefined", "name.typo"})
        self.assertNotEqual(r["id"], "name.missing-quotes")

    def test_typo_is_not_reported_for_distant_names(self):
        r = explain('apple = 1\nprint(zebra)')
        self.assertNotEqual(r["id"], "name.typo")

    def test_smart_apostrophe_inside_a_valid_string_is_fine(self):
        compile('print("it’s fine")', MAIN, "exec")


class Messages(unittest.TestCase):
    """Every rule has English wording, and the wording only uses parameters the rule provides."""

    @classmethod
    def setUpClass(cls):
        with open(os.path.join(ROOT, "packages", "i18n", "locales", "en.json"), encoding="utf-8") as f:
            cls.en = json.load(f)

    def test_every_id_has_a_message(self):
        missing = [i for i in ex.IDS if f"explain.{i}" not in self.en]
        self.assertEqual(missing, [])

    def test_placeholders_exist_in_params(self):
        for label, code, eid, _, _ in CASES:
            with self.subTest(label):
                r = explain(code)
                needed = set(re.findall(r"\{(\w+)\}", self.en[f"explain.{eid}"]))
                self.assertLessEqual(needed, set(r["params"]), f"{eid} message needs {needed}, rule gives {set(r['params'])}")

    def test_no_orphan_messages(self):
        orphans = [k for k in self.en if k.startswith("explain.") and k[len("explain."):] not in ex.IDS]
        self.assertEqual(orphans, [])


if __name__ == "__main__":
    unittest.main()
