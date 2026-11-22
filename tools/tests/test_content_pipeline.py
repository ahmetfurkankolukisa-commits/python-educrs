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
"dog" = { id = "mc.vars-auto-update", message = "b keeps the value it got." }
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
# Five exercises: every concept with a lesson needs at least 5 (§16.4).
FIVE = ex("ex:vars.use/predict") + ex("ex:vars.use/predict2") + ex("ex:vars.use/predict3") + ex("ex:vars.use/fill") + ex("ex:vars.use/greet")
LESSON = HEAD + EXPLAIN + FIVE


def renamed(files, old_id, new_id):
    return dict(files, **{"exercise.toml": files["exercise.toml"].replace(f'id = "{old_id}"', f'id = "{new_id}"')})


PROJECT = {
    "exercise.toml": """
id = "ex:proj.business-card/name"
concept = "proj.business-card"
type = "code"
difficulty = "easy"
title = "Your name"
prompt = "Print your name and your job on two lines."
[check]
kind = "stdout"
[[hints]]
text = "one"
[[hints]]
text = "two"
""",
    "starter.py": "# Write your program below this line\n",
    "solution.py": 'print("Ada Lovelace")\nprint("Programmer")\n',
}
PROJECT_LESSON = 'concept = "proj.business-card"\ntitle = "Project: Business card"\n' + EXPLAIN + "".join(
    ex(f"ex:proj.business-card/{slug}") for slug in ("name", "job", "card"))


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
        self.write("vars.reassign/predict", PREDICT, **{"exercise.toml": [('options = ["cat", "dog"]', 'options = ["dog", "a"]'), ('"dog" = { id = "mc.vars-auto-update", message = "b keeps the value it got." }', '')]})
        self.assertIn("answer-not-in-options", self.codes())

    def test_predict_correct_option_tagged_as_misconception(self):
        self.write("vars.reassign/predict", PREDICT, **{"exercise.toml": [('"dog" = {', '"cat" = {')]})
        self.assertIn("correct-option-has-misconception", self.codes())

    def test_predict_misconception_without_message(self):
        # the pre-F3.5 form (bare id) gave the learner nothing to read (§14.4)
        self.write("vars.reassign/predict", PREDICT, **{"exercise.toml": [('"dog" = { id = "mc.vars-auto-update", message = "b keeps the value it got." }', '"dog" = "mc.vars-auto-update"')]})
        self.assertIn("bad-option-misconceptions", self.codes())

    def test_predict_misconception_with_empty_message(self):
        self.write("vars.reassign/predict", PREDICT, **{"exercise.toml": [('message = "b keeps the value it got."', 'message = "  "')]})
        self.assertIn("bad-option-misconceptions", self.codes())

    def test_predict_misconception_on_unknown_option(self):
        self.write("vars.reassign/predict", PREDICT, **{"exercise.toml": [('"dog" = {', '"bird" = {')]})
        self.assertIn("unknown-option", self.codes())

    def test_predict_misconception_not_in_catalog(self):
        self.write("vars.reassign/predict", PREDICT, **{"exercise.toml": [('id = "mc.vars-auto-update"', 'id = "mc.no-such-thing"')]})
        self.assertIn("unknown-misconception", self.codes())

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
    def lesson(self, text, name="vars.use.toml", good=GOOD):
        self.write("vars.use/greet", good)
        self.write("vars.use/fill", FILL)
        self.write("vars.use/predict", PREDICT_USE)
        self.write("vars.use/predict2", renamed(PREDICT_USE, "ex:vars.use/predict", "ex:vars.use/predict2"))
        self.write("vars.use/predict3", renamed(PREDICT_USE, "ex:vars.use/predict", "ex:vars.use/predict3"))
        d = self.tmp / "content" / "en" / "lessons"
        d.mkdir(parents=True, exist_ok=True)
        (d / name).write_text(text, encoding="utf-8")

    def test_valid_lesson_passes(self):
        self.lesson(LESSON)
        self.assertEqual(self.codes(), set())

    def test_unknown_exercise(self):
        self.lesson(HEAD + EXPLAIN + FIVE + ex("ex:vars.use/missing"))
        self.assertIn("unknown-exercise", self.codes())

    def test_exercise_from_another_concept(self):
        self.write("vars.reassign/predict", PREDICT)
        self.lesson(HEAD + EXPLAIN + FIVE + ex("ex:vars.reassign/predict"))
        self.assertIn("exercise-wrong-concept", self.codes())

    def test_too_few_exercises(self):
        self.lesson(HEAD + EXPLAIN + ex("ex:vars.use/predict") + ex("ex:vars.use/greet"))
        self.assertIn("too-few-exercises", self.codes())

    def test_must_start_with_explain(self):
        self.lesson(HEAD + ex("ex:vars.use/predict") + EXPLAIN + ex("ex:vars.use/predict2") + ex("ex:vars.use/predict3") + ex("ex:vars.use/fill") + ex("ex:vars.use/greet"))
        self.assertIn("first-step-not-explain", self.codes())

    def test_must_end_with_exercise(self):
        self.lesson(LESSON + DONE)
        self.assertIn("last-step-not-exercise", self.codes())

    def test_example_that_raises(self):
        self.lesson(HEAD + EXPLAIN_RAISES + FIVE)
        self.assertIn("example-raises", self.codes())

    def test_exercise_used_twice(self):
        self.lesson(LESSON + ex("ex:vars.use/greet"))
        self.assertIn("exercise-reused", self.codes())

    def test_file_name_must_match_concept(self):
        self.lesson(LESSON, name="variables.toml")
        self.assertIn("lesson-file-mismatch", self.codes())

    # --- F3.7 (§16.4): coverage, misconception coverage, readability
    def test_concept_with_a_lesson_needs_five_items(self):
        self.lesson(LESSON)
        (self.tmp / "content" / "en" / "exercises" / "vars.use" / "predict3" / "exercise.toml").unlink()
        self.assertIn("too-few-items", self.codes())

    def test_misconception_of_the_concept_must_be_taught(self):
        no_mc = dict(GOOD, **{"exercise.toml": GOOD["exercise.toml"].split("[[misconceptions]]")[0]})
        self.lesson(HEAD + EXPLAIN + FIVE, good=no_mc)
        self.write("vars.use/fill", FILL, **{"exercise.toml": [("""[tile_misconceptions]
'"name"' = { id = "mc.quoted-name", message = "Remove the quotes." }
""", "")]})
        self.assertIn("misconception-not-taught", self.codes())

    def test_dense_prose_is_too_hard_to_read(self):
        dense = ('[[steps]]\nkind = "explain"\ntext = "Assignment statements establish associations between identifiers and '
                 'corresponding object references. Subsequent evaluation dereferences identifiers, retrieving associated values."\n')
        self.lesson(HEAD + dense + FIVE)
        self.assertIn("hard-to-read", self.codes())

    def test_a_very_long_sentence(self):
        long_one = "When you run it the computer reads " + " and then ".join(["the next line"] * 6) + " until it reaches the end."
        self.lesson(HEAD + f'[[steps]]\nkind = "explain"\ntext = "{long_one}"\n' + FIVE)
        self.assertIn("long-sentence", self.codes())

    def test_code_blocks_are_not_measured(self):
        code = "\n".join(["characterisation_of_extraordinarily_complicated_identifiers = 'internationalisation'"] * 4)
        text = f'Run this program.\n\n```python\n{code}\n```\n\nIt makes a long name.'
        self.lesson(HEAD + f'[[steps]]\nkind = "explain"\ntext = """{text}"""\n' + FIVE)
        self.assertEqual(self.codes(), set())


class ProjectTests(_ContentTree):
    """Projects are lessons too, placed after their module's concepts (§16.3)."""

    def project(self, n=3, lesson=PROJECT_LESSON):
        for slug in ("name", "job", "card")[:n]:
            self.write(f"proj.business-card/{slug}", renamed(PROJECT, "ex:proj.business-card/name", f"ex:proj.business-card/{slug}"))
        d = self.tmp / "content" / "en" / "lessons"
        d.mkdir(parents=True, exist_ok=True)
        (d / "proj.business-card.toml").write_text(lesson, encoding="utf-8")

    def test_a_project_with_three_steps_passes_and_sits_at_the_end_of_its_module(self):
        self.project()
        bundle, _, report = pipeline.build(self.tmp)
        self.assertEqual(report.errors, [])
        self.assertEqual(bundle["path"], [{"module": "M1", "title": "print, strings, comments", "lessons": ["lesson:proj.business-card"]}])

    def test_unknown_project(self):
        self.project(lesson=PROJECT_LESSON.replace('concept = "proj.business-card"', 'concept = "proj.nope"'))
        self.assertIn("unknown-concept", self.codes())

    def test_project_needs_at_least_three_steps(self):
        self.project(n=2, lesson=PROJECT_LESSON.replace(ex("ex:proj.business-card/card"), ""))
        self.assertIn("too-few-exercises", self.codes())

    def test_project_must_come_after_what_it_requires(self):
        cat = self.tmp / "content" / "concepts.toml"
        text = cat.read_text(encoding="utf-8")
        old = 'requires = ["print.end-sep", "strings.escape"]'
        self.assertIn(old, text)
        cat.write_text(text.replace(old, 'requires = ["print.end-sep", "vars.swap"]'), encoding="utf-8")
        self.project()
        self.assertIn("project-before-requirement", self.codes())


class PathTests(_ContentTree):
    """The learning path follows concepts.toml order, not file names (§13.6, §14.5)."""

    def test_lessons_carry_their_module_and_path_follows_catalog_order(self):
        self.write("vars.use/greet", GOOD)
        self.write("vars.use/fill", FILL)
        self.write("vars.use/predict", PREDICT_USE)
        self.write("vars.use/predict2", renamed(PREDICT_USE, "ex:vars.use/predict", "ex:vars.use/predict2"))
        self.write("vars.use/predict3", renamed(PREDICT_USE, "ex:vars.use/predict", "ex:vars.use/predict3"))
        self.write("vars.reassign/predict", PREDICT)
        for n in (2, 3, 4):
            self.write(f"vars.reassign/predict{n}", renamed(PREDICT, "ex:vars.reassign/predict", f"ex:vars.reassign/predict{n}"))
        self.write("vars.reassign/history", renamed(PREDICT, "ex:vars.reassign/predict", "ex:vars.reassign/history"),
                   **{"exercise.toml": [('id = "mc.vars-auto-update"', 'id = "mc.var-remembers-history"')]})
        d = self.tmp / "content" / "en" / "lessons"
        d.mkdir(parents=True, exist_ok=True)
        # vars.reassign sorts first by file name, but comes after vars.use in the catalog
        (d / "vars.reassign.toml").write_text('concept = "vars.reassign"\ntitle = "Reassignment"\n' + EXPLAIN
            + "".join(ex(f"ex:vars.reassign/{s}") for s in ("predict", "predict2", "predict3", "predict4", "history")), encoding="utf-8")
        (d / "vars.use.toml").write_text(LESSON, encoding="utf-8")
        bundle, _, report = pipeline.build(self.tmp)
        self.assertEqual(report.errors, [])
        self.assertEqual({l["id"]: l["module"] for l in bundle["lessons"]}, {"lesson:vars.use": "M2", "lesson:vars.reassign": "M2"})
        self.assertEqual(bundle["path"], [{"module": "M2", "title": "Variables", "lessons": ["lesson:vars.use", "lesson:vars.reassign"]}])
        self.assertEqual(bundle["schema"], pipeline.BUNDLE_SCHEMA)


if __name__ == "__main__":
    unittest.main()
