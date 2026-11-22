"""Negative tests for tools/content/pipeline.py: every broken exercise MUST be rejected with the
right error code, and a valid one must pass. Builds throw-away content trees in a temp dir.

Run: python3 -m unittest discover -s tools/tests -p "test_content_pipeline.py"
"""
import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools" / "content"))
import pipeline  # noqa: E402

GOOD = {
    "exercise.toml": """
id = "ex:vars.use/greet"
concept = "vars.use"
type = "code"
difficulty = "easy"
title = "Greet"
prompt = "Print Hello and the name."
[check]
kind = "program-with-inputs"
inputs = ["name"]
tests = [{ name = "Ada" }]
random = { count = 4, types = { name = "str" } }
[[hints]]
text = "one"
[[hints]]
text = "two"
[[misconceptions]]
id = "mc.quoted-name"
program = "wrong.py"
message = "Remove the quotes."
""",
    "starter.py": 'name = "Ada"\n',
    "solution.py": 'name = "Ada"\nprint("Hello,", name)\n',
    "wrong.py": 'name = "Ada"\nprint("Hello,", "name")\n',
}

PREDICT = {
    "exercise.toml": """
id = "ex:vars.reassign/predict"
concept = "vars.reassign"
type = "predict-output"
difficulty = "easy"
title = "Predict"
prompt = "What prints?"
options = ["cat", "dog"]
explanation = "b keeps the old value."
[option_misconceptions]
"dog" = "mc.vars-auto-update"
""",
    "program.py": 'a = "cat"\nb = a\na = "dog"\nprint(b)\n',
}


FILL = {
    "exercise.toml": """
id = "ex:vars.use/fill"
concept = "vars.use"
type = "fill-gap"
difficulty = "easy"
title = "Fill"
prompt = "Fill the gap."
template = \"\"\"name = "Ada"
print("Hello,", ____)\"\"\"
tiles = ["name", '"name"', "Name"]
answer = "name"
explanation = "Use the variable."
[tile_misconceptions]
'"name"' = { id = "mc.quoted-name", message = "Remove the quotes." }
""",
}

PREDICT_USE = {
    "exercise.toml": """
id = "ex:vars.use/predict"
concept = "vars.use"
type = "predict-output"
difficulty = "easy"
title = "Predict"
prompt = "What prints?"
options = ["Ada", "name"]
explanation = "The value is printed."
""",
    "program.py": 'name = "Ada"\nprint(name)\n',
}

EXPLAIN = '[[steps]]\nkind = "explain"\ntext = "Variables hold values."\nexample = """x = 1\nprint(x)"""\n'
EXPLAIN_RAISES = '[[steps]]\nkind = "explain"\ntext = "Variables hold values."\nexample = """print(y)"""\n'
DONE = '[[steps]]\nkind = "explain"\ntext = "Done."\n'


def ex(eid):
    return f'[[steps]]\nkind = "exercise"\nid = "{eid}"\n'


HEAD = 'concept = "vars.use"\ntitle = "Using variables"\n'
LESSON = HEAD + EXPLAIN + ex("ex:vars.use/predict") + ex("ex:vars.use/fill") + ex("ex:vars.use/greet")


class _ContentTree(unittest.TestCase):
    """Throw-away content tree (no tests of its own, so subclasses don't re-run base tests)."""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        (self.tmp / "content").mkdir()
        shutil.copy(ROOT / "content" / "concepts.toml", self.tmp / "content" / "concepts.toml")

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def write(self, rel_dir, files, **edits):
        d = self.tmp / "content" / "en" / "exercises" / rel_dir
        d.mkdir(parents=True, exist_ok=True)
        for name, text in files.items():
            for old, new in edits.get(name, []):
                assert old in text, (name, old)  # a silent no-op replace would make the test meaningless
                text = text.replace(old, new)
            (d / name).write_text(text, encoding="utf-8")

    def codes(self):
        _, _, report = pipeline.build(self.tmp)
        return {code for _, code, _ in report.errors}


class PipelineNegativeTests(_ContentTree):
    # --- baseline: the checks below only mean something if a valid exercise passes
    def test_valid_exercises_pass(self):
        self.write("vars.use/greet", GOOD)
        self.write("vars.reassign/predict", PREDICT)
        self.assertEqual(self.codes(), set())

    # --- execution checks
    def test_starter_that_already_passes(self):
        self.write("vars.use/greet", dict(GOOD, **{"starter.py": GOOD["solution.py"]}))
        self.assertIn("starter-passes", self.codes())

    def test_solution_that_raises(self):
        self.write("vars.use/greet", dict(GOOD, **{"solution.py": 'name = "Ada"\nprint("Hello,", name[5])\n'}))
        self.assertIn("solution-raises", self.codes())

    def test_nondeterministic_solution(self):
        self.write("vars.use/greet", dict(GOOD, **{"solution.py": 'name = "Ada"\nimport random\nprint(random.SystemRandom().random())\n'}))
        self.assertIn("solution-fails", self.codes())

    def test_misconception_program_that_is_actually_correct(self):
        self.write("vars.use/greet", dict(GOOD, **{"wrong.py": GOOD["solution.py"]}))
        self.assertIn("misconception-not-triggered", self.codes())

    def test_two_misconceptions_that_behave_identically(self):
        toml = GOOD["exercise.toml"] + '[[misconceptions]]\nid = "mc.comma-vs-plus"\nprogram = "wrong.py"\nmessage = "dup"\n'
        self.write("vars.use/greet", dict(GOOD, **{"exercise.toml": toml}))
        self.assertIn("misconception-not-triggered", self.codes())

    def test_solution_missing_input_assignment(self):
        self.write("vars.use/greet", dict(GOOD, **{"solution.py": 'print("Hello, Ada")\n'}))
        self.assertIn("content-error", self.codes())

    def test_predict_answer_not_among_options(self):
        self.write("vars.reassign/predict", PREDICT, **{"exercise.toml": [('options = ["cat", "dog"]', 'options = ["dog", "a"]'), ('"dog" = "mc.vars-auto-update"', '')]})
        self.assertIn("answer-not-in-options", self.codes())

    def test_predict_correct_option_tagged_as_misconception(self):
        self.write("vars.reassign/predict", PREDICT, **{"exercise.toml": [('"dog" = "mc.vars-auto-update"', '"cat" = "mc.vars-auto-update"')]})
        self.assertIn("correct-option-has-misconception", self.codes())

    # --- static checks
    def test_unknown_concept(self):
        self.write("vars.use/greet", GOOD, **{"exercise.toml": [('concept = "vars.use"', 'concept = "vars.usage"')]})
        self.assertIn("unknown-concept", self.codes())

    def test_unknown_misconception(self):
        self.write("vars.use/greet", GOOD, **{"exercise.toml": [('id = "mc.quoted-name"', 'id = "mc.not-in-catalog"')]})
        self.assertIn("unknown-misconception", self.codes())

    def test_too_few_hints(self):
        self.write("vars.use/greet", GOOD, **{"exercise.toml": [('[[hints]]\ntext = "two"\n', "")]})
        self.assertIn("too-few-hints", self.codes())

    def test_bad_id_and_folder_mismatch(self):
        self.write("vars.use/greet", GOOD, **{"exercise.toml": [('id = "ex:vars.use/greet"', 'id = "ex:vars.use/other"')]})
        self.assertIn("folder-mismatch", self.codes())
        self.write("vars.use/greet", GOOD, **{"exercise.toml": [('id = "ex:vars.use/greet"', 'id = "greet"')]})
        self.assertIn("bad-id", self.codes())

    def test_missing_file(self):
        files = dict(GOOD)
        del files["wrong.py"]
        self.write("vars.use/greet", files)
        self.assertIn("missing-file", self.codes())

    def test_bad_random_spec(self):
        self.write("vars.use/greet", GOOD, **{"exercise.toml": [('types = { name = "str" }', 'types = { name = "float" }')]})
        self.assertIn("bad-random", self.codes())

    def test_duplicate_id(self):
        self.write("vars.use/greet", GOOD)
        self.write("vars.use/greet-copy", GOOD)  # same id, wrong folder
        self.assertIn("duplicate-id", self.codes())


class FillGapNegativeTests(_ContentTree):
    def test_valid_fill_gap_passes(self):
        self.write("vars.use/fill", FILL)
        self.assertEqual(self.codes(), set())

    def test_ambiguous_tiles(self):
        self.write("vars.use/fill", FILL, **{"exercise.toml": [('tiles = ["name", \'"name"\', "Name"]', 'tiles = ["name", "(name)", "Name"]'), ("'\"name\"' = { id", "'Name' = { id")]})
        self.assertIn("ambiguous-tiles", self.codes())

    def test_answer_not_among_tiles(self):
        self.write("vars.use/fill", FILL, **{"exercise.toml": [('answer = "name"', 'answer = "nam"')]})
        self.assertIn("answer-not-in-tiles", self.codes())

    def test_answer_that_raises(self):
        self.write("vars.use/fill", FILL, **{"exercise.toml": [('answer = "name"', 'answer = "Name"')]})
        self.assertIn("answer-raises", self.codes())

    def test_template_needs_exactly_one_gap(self):
        self.write("vars.use/fill", FILL, **{"exercise.toml": [('print("Hello,", ____)', 'print(____, ____)')]})
        self.assertIn("bad-gap", self.codes())

    def test_answer_tile_cannot_carry_a_misconception(self):
        self.write("vars.use/fill", FILL, **{"exercise.toml": [("'\"name\"' = { id", "'name' = { id")]})
        self.assertIn("correct-tile-has-misconception", self.codes())

    def test_tile_misconception_must_be_in_catalog(self):
        self.write("vars.use/fill", FILL, **{"exercise.toml": [('id = "mc.quoted-name"', 'id = "mc.nope"')]})
        self.assertIn("unknown-misconception", self.codes())

    def test_duplicate_tiles(self):
        self.write("vars.use/fill", FILL, **{"exercise.toml": [('tiles = ["name", \'"name"\', "Name"]', 'tiles = ["name", "name", \'"name"\']')]})
        self.assertIn("duplicate-tiles", self.codes())


class LessonNegativeTests(_ContentTree):
    def lesson(self, text, name="vars.use.toml"):
        self.write("vars.use/greet", GOOD)
        self.write("vars.use/fill", FILL)
        self.write("vars.use/predict", PREDICT_USE)
        d = self.tmp / "content" / "en" / "lessons"
        d.mkdir(parents=True, exist_ok=True)
        (d / name).write_text(text, encoding="utf-8")

    def test_valid_lesson_passes(self):
        self.lesson(LESSON)
        self.assertEqual(self.codes(), set())

    def test_unknown_exercise(self):
        self.lesson(HEAD + EXPLAIN + ex("ex:vars.use/predict") + ex("ex:vars.use/missing") + ex("ex:vars.use/greet"))
        self.assertIn("unknown-exercise", self.codes())

    def test_exercise_from_another_concept(self):
        self.write("vars.reassign/predict", PREDICT)
        self.lesson(HEAD + EXPLAIN + ex("ex:vars.use/predict") + ex("ex:vars.reassign/predict") + ex("ex:vars.use/greet"))
        self.assertIn("exercise-wrong-concept", self.codes())

    def test_too_few_exercises(self):
        self.lesson(HEAD + EXPLAIN + ex("ex:vars.use/predict") + ex("ex:vars.use/greet"))
        self.assertIn("too-few-exercises", self.codes())

    def test_must_start_with_explain(self):
        self.lesson(HEAD + ex("ex:vars.use/predict") + EXPLAIN + ex("ex:vars.use/fill") + ex("ex:vars.use/greet"))
        self.assertIn("first-step-not-explain", self.codes())

    def test_must_end_with_exercise(self):
        self.lesson(LESSON + DONE)
        self.assertIn("last-step-not-exercise", self.codes())

    def test_example_that_raises(self):
        self.lesson(HEAD + EXPLAIN_RAISES + ex("ex:vars.use/predict") + ex("ex:vars.use/fill") + ex("ex:vars.use/greet"))
        self.assertIn("example-raises", self.codes())

    def test_exercise_used_twice(self):
        self.lesson(LESSON + ex("ex:vars.use/greet"))
        self.assertIn("exercise-reused", self.codes())

    def test_file_name_must_match_concept(self):
        self.lesson(LESSON, name="variables.toml")
        self.assertIn("lesson-file-mismatch", self.codes())


if __name__ == "__main__":
    unittest.main()
