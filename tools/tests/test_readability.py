"""Unit tests for tools/content/readability.py (docs/05-f3-mvp0.md §16.4).

Run: python3 -m unittest discover -s tools/tests -p "test_readability.py"
"""
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools" / "content"))
import readability as r  # noqa: E402


class SyllableTests(unittest.TestCase):
    def test_common_words(self):
        cases = {"the": 1, "cat": 1, "print": 1, "type": 1, "name": 1, "names": 1, "quotes": 1, "named": 1,
                 "python": 2, "value": 2, "program": 2, "number": 2, "error": 2, "hello": 2,
                 "computer": 3, "assignment": 3, "remember": 3, "instructions": 3, "": 0}
        self.assertEqual({w: r.syllables(w) for w in cases}, cases)


class SplittingTests(unittest.TestCase):
    def test_code_is_not_measured(self):
        text = "Run this:\n\n```python\nprint(supercalifragilisticexpialidocious_variable_name)\n```\n\nThen look."
        self.assertNotIn("supercalifragilistic", r.prose(text))
        self.assertEqual(r.sentences(r.prose(text)), ["Run this", "Then look."])

    def test_indented_code_is_not_measured_and_inline_code_is_one_word(self):
        text = "It prints:\n\n    Hello, extraordinarily_long_identifier\n\nUse `print(\"a very long string\")` here."
        self.assertEqual(r.sentences(r.prose(text)), ["It prints", "Use X here."])

    def test_sentences_end_at_punctuation_blank_lines_and_list_items(self):
        text = "One. Two!\n\nThree?\n- four five\n- six"
        self.assertEqual(r.sentences(text), ["One.", "Two!", "Three?", "- four five", "- six"])


class MeasureTests(unittest.TestCase):
    def test_plain_text_scores_high_and_dense_text_low(self):
        plain = r.measure(["The cat sat on the mat. We went to the park and played all day."])
        dense = r.measure(["Assignment statements establish associations between identifiers and object references, persisting throughout program execution."])
        self.assertGreater(plain["ease"], 90)
        self.assertLess(dense["ease"], 20)

    def test_longest_sentence(self):
        m = r.measure(["Short one.", "This sentence has exactly eight words in it."])
        self.assertEqual((m["longest"], m["longest_sentence"]), (8, "This sentence has exactly eight words in it."))

    def test_nothing_to_measure(self):
        self.assertIsNone(r.measure(["```\nprint(1)\n```"])["ease"])


if __name__ == "__main__":
    unittest.main()
