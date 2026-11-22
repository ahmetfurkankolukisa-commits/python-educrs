"""educrs error explainer v1 (docs/05-f3-mvp0.md §4).

Turns a learner's error into a stable CODE + parameters, e.g.
    {"id": "name.case", "params": {"name": "Print", "suggestion": "print"}, "lineno": 1}
The app renders the words through i18n (`explain.<id>`), so wording is translatable and the
rules here can be unit-tested in CPython and Pyodide alike.

Rules look at STRUCTURE — exception type, lineno, the learner's source text, names assigned in
the program, builtins — never at the exception message, whose wording changes between Python
versions (F2 finding: 3.15 rewrote "Did you mean").
"""
from __future__ import annotations

import ast
import builtins
import keyword
import re

IDS = (
    "syntax.smart-quotes",
    "syntax.unterminated-string",
    "syntax.print-no-parens",
    "syntax.unbalanced-brackets",
    "syntax.assign-to-literal",
    "syntax.keyword-name",
    "syntax.bad-name",
    "syntax.missing-quotes",
    "syntax.missing-comma",
    "syntax.generic",
    "indent.unexpected",
    "name.case",
    "name.before-assign",
    "name.typo",
    "name.missing-quotes",
    "name.undefined",
    "type.shadowed-builtin",
    "runtime.generic",
)

SMART_QUOTES = "“”‘’"
BUILTIN_NAMES = frozenset(n for n in dir(builtins) if not n.startswith("_"))
_ASSIGN = r"\s*=(?!=)"
_PAIRS = {"(": ")", "[": "]", "{": "}"}
_CLOSERS = {v: k for k, v in _PAIRS.items()}


def _out(eid, lineno, **params):
    assert eid in IDS, eid
    return {"id": eid, "params": params, "lineno": lineno}


# ------------------------------------------------------------------ tiny lexer
def _lex(line):
    """Tokens of ONE line: (kind, text) with kind in STRING NAME NUMBER OP.
    Returns (tokens, unterminated_quote_char_or_None). Comments are dropped."""
    tokens, i, n = [], 0, len(line)
    while i < n:
        ch = line[i]
        if ch in " \t\r\n":
            i += 1
        elif ch == "#":
            break
        elif ch in "\"'":
            if line.startswith(ch * 3, i):  # triple quotes may span lines: out of scope for v1
                return tokens, None
            j = i + 1
            while j < n and line[j] != ch:
                j += 2 if line[j] == "\\" else 1
            if j >= n:
                return tokens, ch
            tokens.append(("STRING", line[i : j + 1]))
            i = j + 1
        elif ch.isalpha() or ch == "_":
            j = i
            while j < n and (line[j].isalnum() or line[j] == "_"):
                j += 1
            word = line[i:j]
            if j < n and line[j] in "\"'" and word.lower() in {"f", "r", "b", "rb", "br", "fr", "rf", "u"}:
                i = j  # string prefix: let the quote branch read the string
                continue
            tokens.append(("NAME", word))
            i = j
        elif ch.isdigit():
            j = i
            while j < n and (line[j].isalnum() or line[j] in "._"):
                j += 1
            tokens.append(("NUMBER", line[i:j]))
            i = j
        else:
            tokens.append(("OP", ch))
            i += 1
    return tokens, None


def _bracket_problem(code):
    stack = []
    for lineno, line in enumerate(code.splitlines(), 1):
        tokens, _ = _lex(line)
        for kind, text in tokens:
            if kind != "OP":
                continue
            if text in _PAIRS:
                stack.append((text, lineno))
            elif text in _CLOSERS:
                if not stack or stack[-1][0] != _CLOSERS[text]:
                    return {"char": text, "missing": _CLOSERS[text], "line": lineno}
                stack.pop()
    if stack:
        char, lineno = stack[-1]
        return {"char": char, "missing": _PAIRS[char], "line": lineno}
    return None


# ------------------------------------------------------------------ names in the program
def _assigned_names(code):
    """{name: first line it is bound on}. Empty if the code does not parse."""
    try:
        tree = ast.parse(code)
    except SyntaxError:
        return {}
    found = {}

    def bind(name, node):
        line = getattr(node, "lineno", 0)
        if name not in found or line < found[name]:
            found[name] = line

    for node in ast.walk(tree):
        if isinstance(node, ast.Name) and isinstance(node.ctx, (ast.Store, ast.Del)):
            bind(node.id, node)
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            bind(node.name, node)
        elif isinstance(node, ast.arg):
            bind(node.arg, node)
        elif isinstance(node, ast.alias):
            bind((node.asname or node.name).split(".")[0], node)
    return found


def _used_as_call_argument(code, name):
    try:
        tree = ast.parse(code)
    except SyntaxError:
        return False
    return any(
        isinstance(node, ast.Call) and any(isinstance(a, ast.Name) and a.id == name for a in node.args)
        for node in ast.walk(tree)
    )


# ------------------------------------------------------------------ explain
def explain(error, code):
    """`error` is the dict produced by educrs_grader.error_info()."""
    etype = error.get("type")
    lineno = error.get("lineno")
    lines = code.splitlines()
    line = lines[lineno - 1] if isinstance(lineno, int) and 0 < lineno <= len(lines) else (error.get("text") or "")
    if etype in ("SyntaxError", "IndentationError", "TabError"):
        return _syntax(etype, code, line, lineno, error.get("offset"), lines)
    if etype == "NameError":
        return _name(error.get("name"), code, lineno)
    if etype == "TypeError":
        found = _shadowed_builtin(code, line, lineno)
        if found:
            return found
    return _out("runtime.generic", lineno, type=etype)


def _syntax(etype, code, line, lineno, offset, lines):
    for ch in SMART_QUOTES:
        if ch in line:
            return _out("syntax.smart-quotes", lineno, char=ch)

    if etype == "IndentationError" and line[:1] in (" ", "\t"):
        prev = next((lines[i].rstrip() for i in range(lineno - 2, -1, -1) if lines[i].strip()), "") if lineno else ""
        if not prev.endswith(":"):
            return _out("indent.unexpected", lineno)

    tokens, open_quote = _lex(line)
    if open_quote:
        return _out("syntax.unterminated-string", lineno, quote=open_quote)

    if re.match(r"^\s*print\b(?!\s*[(=.])\s*\S", line):
        return _out("syntax.print-no-parens", lineno)

    brackets = _bracket_problem(code)
    if brackets:
        return _out("syntax.unbalanced-brackets", brackets["line"], char=brackets["char"], missing=brackets["missing"])

    m = re.match(r"^\s*(?P<lit>([\"']).*\2|\d[\d_.]*)" + _ASSIGN + r"\s*(?P<name>[A-Za-z_]\w*)\s*$", line)
    if m:
        return _out("syntax.assign-to-literal", lineno, name=m.group("name"), value=m.group("lit"))

    m = re.match(r"^\s*(?P<name>[A-Za-z_]\w*)" + _ASSIGN, line)
    if m and keyword.iskeyword(m.group("name")):
        return _out("syntax.keyword-name", lineno, name=m.group("name"))

    m = re.match(r"^\s*(?P<lhs>[A-Za-z_]\w*(?:\s+[A-Za-z_]\w*)+)" + _ASSIGN, line)
    if m:
        lhs = " ".join(m.group("lhs").split())
        return _out("syntax.bad-name", lineno, name=lhs, suggestion=lhs.replace(" ", "_"))
    m = re.match(r"^\s*(?P<lhs>\d+[A-Za-z_]\w*)" + _ASSIGN, line)
    if m:
        lhs = m.group("lhs")
        digits = re.match(r"\d+", lhs).group(0)
        return _out("syntax.bad-name", lineno, name=lhs, suggestion=lhs[len(digits):] + digits)

    # Two things side by side inside brackets with nothing between them.
    assigned = _assigned_names(code)
    depth = 0
    for (k1, t1), (k2, t2) in zip(tokens, tokens[1:]):
        if k1 == "OP" and t1 in _PAIRS:
            depth += 1
        elif k1 == "OP" and t1 in _CLOSERS:
            depth -= 1
        if depth <= 0 or "OP" in (k1, k2):
            continue
        if k1 == k2 == "NAME" and not keyword.iskeyword(t1) and not keyword.iskeyword(t2) and t1 not in assigned and t2 not in assigned:
            words = _words_run(tokens, t1)
            return _out("syntax.missing-quotes", lineno, text=words)
        if {k1, k2} <= {"STRING", "NAME", "NUMBER"} and not (k1 == k2 == "STRING") and not keyword.iskeyword(t1) and not keyword.iskeyword(t2):
            return _out("syntax.missing-comma", lineno, left=t1, right=t2)

    return _out("syntax.generic", lineno, offset=offset)


def _words_run(tokens, first):
    """The run of consecutive NAME tokens starting at `first` (e.g. 'Hello world')."""
    words, started = [], False
    for kind, text in tokens:
        if not started and kind == "NAME" and text == first:
            started = True
        if started:
            if kind != "NAME":
                break
            words.append(text)
    return " ".join(words)


def typo_distance(a, b):
    """Optimal-string-alignment distance: insert, delete, replace, or swap two neighbours = 1.
    Swaps matter: `nmae`/`name` and `pritn`/`print` are the most common beginner typos, and
    difflib's similarity ratio scores them too low."""
    a, b = a.lower(), b.lower()
    prev2, prev = None, list(range(len(b) + 1))
    for i in range(1, len(a) + 1):
        cur = [i] + [0] * len(b)
        for j in range(1, len(b) + 1):
            cost = 0 if a[i - 1] == b[j - 1] else 1
            cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
            if prev2 is not None and i > 1 and j > 1 and a[i - 1] == b[j - 2] and a[i - 2] == b[j - 1]:
                cur[j] = min(cur[j], prev2[j - 2] + 1)
        prev2, prev = prev, cur
    return prev[len(b)]


def _closest(name, assigned):
    """Best typo candidate: allowed distance grows with length (1 for short names, 2 from 8 letters)."""
    limit = 1 if len(name) < 8 else 2
    best = None
    for cand in set(assigned) | BUILTIN_NAMES:
        if cand == name or abs(len(cand) - len(name)) > limit:
            continue
        d = typo_distance(name, cand)
        if d <= limit:
            key = (d, 0 if cand in assigned else 1, cand)  # prefer the learner's own names
            if best is None or key < best:
                best = key
    return best[2] if best else None


def _name(name, code, lineno):
    if not name:
        return _out("name.undefined", lineno, name="?")
    assigned = _assigned_names(code)
    known = set(assigned) | BUILTIN_NAMES
    same_letters = sorted(k for k in known if k.lower() == name.lower() and k != name)
    if same_letters:
        return _out("name.case", lineno, name=name, suggestion=same_letters[0])
    if name in assigned:
        return _out("name.before-assign", lineno, name=name, line=assigned[name])
    close = _closest(name, assigned)
    if close:
        return _out("name.typo", lineno, name=name, suggestion=close)
    if _used_as_call_argument(code, name) or name[:1].isupper():
        return _out("name.missing-quotes", lineno, name=name)
    return _out("name.undefined", lineno, name=name)


def _shadowed_builtin(code, line, lineno):
    assigned = _assigned_names(code)
    for name in sorted(set(assigned) & BUILTIN_NAMES):
        if re.search(r"\b" + re.escape(name) + r"\s*\(", line) and assigned[name] != lineno:
            return _out("type.shadowed-builtin", lineno, name=name, line=assigned[name])
    return None
