"""Unit tests for packages/grader/educrs_grader.py (stdlib unittest; CPython and Pyodide).

They assert structure (problem codes, error types, counts), never message text, because
message wording changes between Python versions (F2 finding).
Run: python3 -m unittest discover -s tools/tests -p "test_grader.py"
"""
import builtins
import os
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "packages", "grader"))
import educrs_grader as g  # noqa: E402

GREET = {
    "check": {
        "kind": "program-with-inputs",
        "inputs": ["name"],
        "tests": [{"name": "Ada"}, {"name": "Grace Hopper"}],
        "random": {"count": 6, "types": {"name": "str"}},
    },
    "solution": 'name = "Ada"\nprint("Hello,", name)\n',
    "misconceptions": [
        {"id": "mc.quoted-name", "program": 'name = "Ada"\nprint("Hello,", "name")\n', "message": "quoted"},
    ],
}
HELLO = {"check": {"kind": "stdout"}, "solution": 'print("Hello, world!")\n'}
VERBATIM = {"check": {"kind": "verbatim", "target": 'print("Hello, world!")\n'}}


class Stdout(unittest.TestCase):
    def test_correct(self):
        r = g.grade(HELLO, 'print("Hello, world!")', 1)
        self.assertTrue(r["passed"])
        self.assertEqual((r["tests_total"], r["tests_passed"]), (1, 1))

    def test_trailing_whitespace_is_ignored(self):
        self.assertTrue(g.grade(HELLO, 'print("Hello, world!   ")\nprint()', 1)["passed"])

    def test_wrong_output(self):
        r = g.grade(HELLO, 'print("hello world")', 1)
        self.assertFalse(r["passed"])
        self.assertEqual(r["problem"], "wrong-output")
        self.assertEqual(r["failed"]["expected"], "Hello, world!\n")
        self.assertEqual(r["failed"]["actual"], "hello world\n")

    def test_syntax_error(self):
        r = g.grade(HELLO, 'print("Hello, world!)', 1)
        self.assertEqual(r["problem"], "syntax")
        self.assertEqual(r["error"]["type"], "SyntaxError")
        self.assertEqual(r["error"]["lineno"], 1)

    def test_runtime_error_points_at_user_line(self):
        r = g.grade(HELLO, 'x = 1\nprint(Hello)', 1)
        self.assertEqual(r["problem"], "runtime")
        self.assertEqual(r["error"]["type"], "NameError")
        self.assertEqual(r["error"]["name"], "Hello")
        self.assertEqual(r["error"]["lineno"], 2)
        self.assertNotIn("educrs_grader", r["error"]["traceback"])

    def test_traceback_source_line_does_not_depend_on_the_file_system(self):
        # The browser sandbox writes /main.py, the content pipeline doesn't; both must report the
        # learner's own line (e2e golden parity found the difference, F3.7).
        import linecache, os, tempfile
        code = 'x = 1\nprint(Hello)'
        missing = os.path.join(tempfile.mkdtemp(), "nowhere", "main.py")
        with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as f:
            f.write("something = 'else'\nentirely_different()\n")
        for filename in (missing, f.name):
            r = g.grade(HELLO, code, 1, filename=filename)
            self.assertEqual(r["error"]["text"], "print(Hello)", filename)
            self.assertIn("print(Hello)", r["error"]["traceback"], filename)
            self.assertNotIn(filename, linecache.cache)  # nothing left behind
        os.unlink(f.name)


class ProgramWithInputs(unittest.TestCase):
    def test_correct_passes_all_tests_including_own_values(self):
        r = g.grade(GREET, 'name = "Zed"\nprint("Hello,", name)', 3)
        self.assertTrue(r["passed"], r)
        self.assertEqual(r["tests_total"], r["tests_passed"])
        self.assertGreaterEqual(r["tests_total"], 3)

    def test_own_values_are_the_first_test(self):
        r = g.grade(GREET, 'name = "Zed"\nprint("Hi", name)', 3)
        self.assertEqual(r["failed"]["inputs"], {"name": "Zed"})

    def test_hardcoded_answer_fails_on_other_inputs(self):
        r = g.grade(GREET, 'name = "Ada"\nprint("Hello, Ada")', 3)
        self.assertFalse(r["passed"])
        self.assertEqual(r["problem"], "wrong-output")
        self.assertNotEqual(r["failed"]["inputs"], {"name": "Ada"})

    def test_missing_input_assignment(self):
        r = g.grade(GREET, 'print("Hello, Ada")', 3)
        self.assertEqual(r["problem"], "inputs-missing")
        self.assertEqual(r["error"]["missing"], ["name"])

    def test_assignment_order_is_free(self):
        spec = {
            "check": {"kind": "program-with-inputs", "inputs": ["a", "b"], "tests": [{"a": "x", "b": "y"}]},
            "solution": 'a = "1"\nb = "2"\nprint(a, b)',
        }
        self.assertTrue(g.grade(spec, 'b = "2"\na = "1"\nprint(a, b)', 1)["passed"])

    def test_misconception_is_diagnosed(self):
        r = g.grade(GREET, 'name = "Bo"\nprint("Hello,", "name")', 3)
        self.assertEqual(r["misconception"]["id"], "mc.quoted-name")

    def test_no_misconception_for_unrelated_mistake(self):
        r = g.grade(GREET, 'name = "Bo"\nprint("Bye,", name)', 3)
        self.assertIsNone(r["misconception"])

    def test_same_seed_same_result_different_seed_different_tests(self):
        code = 'name = "Ada"\nprint("Hello, Ada")'
        a, b = g.grade(GREET, code, 42), g.grade(GREET, code, 42)
        self.assertEqual(a, b)
        tests = lambda seed: g.make_tests(GREET["check"], __import__("random").Random(seed))  # noqa: E731
        self.assertEqual(tests(1), tests(1))
        self.assertNotEqual(tests(1), tests(2))


class Verbatim(unittest.TestCase):
    def test_whitespace_and_comments_do_not_matter(self):
        self.assertTrue(g.grade(VERBATIM, '# my first program\nprint( "Hello, world!" )\n', 1)["passed"])

    def test_different_structure_fails(self):
        r = g.grade(VERBATIM, "print('Hello world')", 1)
        self.assertEqual(r["problem"], "structure-mismatch")


class Ordering(unittest.TestCase):
    def test_learner_cannot_contaminate_reference_and_builtins_are_restored(self):
        original_print = builtins.print
        code = 'name = "Ada"\nimport builtins\nbuiltins.print = lambda *a, **k: None\nprint("Hello,", name)'
        r = g.grade(GREET, code, 5)
        self.assertFalse(r["passed"])  # expected outputs were computed before this ran
        self.assertIs(builtins.print, original_print)


class ContentErrors(unittest.TestCase):
    def test_solution_without_inputs_is_a_content_error(self):
        spec = dict(GREET, solution='print("Hello, Ada")')
        with self.assertRaises(g.ContentError):
            g.grade(spec, 'name = "Ada"\nprint("Hello,", name)', 1)

    def test_unknown_random_type_is_a_content_error(self):
        with self.assertRaises(g.ContentError):
            g.make_value("float", __import__("random").Random(1))


if __name__ == "__main__":
    unittest.main()
