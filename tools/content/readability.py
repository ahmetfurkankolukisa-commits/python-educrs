"""Readability of learner-facing prose (docs/05-f3-mvp0.md §16.4).

The plan asks for plain B1 English (plan §9.2 I). B1 can't be measured exactly; this is a proxy
that CI can enforce: the Flesch reading ease of a whole lesson, plus a cap on sentence length.
The final judgement is the owner's review (§9).

Pure Python with no dependencies, because the content pipeline runs under CPython AND Pyodide and
both must give the same numbers. Syllables are counted with a common vowel-group heuristic: not
exact, but deterministic and good enough for an average over a lesson.
"""
from __future__ import annotations

import re

MIN_EASE = 70  # Flesch reading ease, per lesson ("fairly easy"; the first two lessons score 86 and 91)
MAX_SENTENCE_WORDS = 25

_FENCE = re.compile(r"```.*?```", re.S)
_INDENTED = re.compile(r"(?m)^(?: {4}|\t).*$")
_INLINE_CODE = re.compile(r"`[^`\n]*`")
# A sentence ends at . ! ? followed by space, at a colon that ends a line (it introduces a code
# block or a list), at a blank line, and before a list item.
_SPLIT = re.compile(r"(?<=[.!?])\s+|:[ \t]*\n|\n[ \t]*\n|\n(?=[ \t]*(?:[-*]|\d+\.)\s)")
_WORD = re.compile(r"[A-Za-z]+(?:'[A-Za-z]+)?")


def prose(markdown: str) -> str:
    """The words a learner reads: code blocks dropped, inline code kept as one short word."""
    text = _FENCE.sub("\n\n", markdown)
    text = _INDENTED.sub("", text)
    text = _INLINE_CODE.sub("X", text)
    return text.replace("**", "").replace("*", "")


def sentences(text: str) -> list[str]:
    return [s.strip() for s in _SPLIT.split(text) if _WORD.search(s)]


def words(sentence: str) -> list[str]:
    return _WORD.findall(sentence)


def syllables(word: str) -> int:
    w = re.sub(r"[^a-z]", "", word.lower())
    if not w:
        return 0
    if len(w) <= 3:
        return 1
    w = re.sub(r"(?:[^laeiouy]es|[^laeiouy]ed|[^laeiouy]e)$", "", w)  # silent endings: "makes", "named", "type"
    w = re.sub(r"^y", "", w)
    return max(1, len(re.findall(r"[aeiouy]{1,2}", w)))


def measure(texts: list[str]) -> dict:
    """Flesch reading ease of all `texts` together, and the longest sentence."""
    all_sentences = [s for t in texts for s in sentences(prose(t))]
    if not all_sentences:
        return {"ease": None, "sentences": 0, "words": 0, "longest": 0, "longest_sentence": ""}
    counts = [(s, words(s)) for s in all_sentences]
    n_words = sum(len(ws) for _, ws in counts)
    n_syllables = sum(syllables(w) for _, ws in counts for w in ws)
    longest, longest_words = max(counts, key=lambda c: len(c[1]))
    ease = 206.835 - 1.015 * (n_words / len(counts)) - 84.6 * (n_syllables / n_words)
    return {"ease": round(ease, 1), "sentences": len(counts), "words": n_words, "longest": len(longest_words), "longest_sentence": longest}
