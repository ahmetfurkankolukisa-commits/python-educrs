# Runs once per worker, in a private namespace (not __main__).
# Captures the pristine interpreter state and restores it after every user run.
# In-process hygiene is BEST EFFORT: a determined user can still reach these objects
# (e.g. via frame inspection). Authoritative grading therefore uses a fresh worker.
import builtins
import json
import os
import sys
import time
from traceback import TracebackException as _TE  # bound now: user patching `traceback` can't affect us

from pyodide.code import eval_code_async

MAIN = "/main.py"
_BDICT = builtins.__dict__
_BUILTINS = dict(_BDICT)
_MODULES = frozenset(sys.modules)
_SYS_ATTRS = {k: getattr(sys, k) for k in ("stdout", "stderr", "stdin", "displayhook", "excepthook")}
_PATH = list(sys.path)
_RECURSION = sys.getrecursionlimit()
_CWD = os.getcwd()

# Shallow snapshot of every preloaded module (catches `json.dumps = None` style patches).
# Pyodide internals and modules with intentionally mutable state are excluded.
_SKIP_PACKAGES = ("_pyodide", "pyodide", "js", "__main__", "builtins", "sys", "linecache", "_frozen_importlib", "importlib")
_MISSING = object()


def _skipped(name):
    # Match whole package names only: "js" must not swallow "json".
    return any(name == p or name.startswith(p + ".") for p in _SKIP_PACKAGES)


def _snapshot_modules():
    import types

    snaps = []
    for name, m in list(sys.modules.items()):
        # JS proxy modules (pyodide_js, js) are not real modules and have no copyable __dict__.
        if not isinstance(m, types.ModuleType) or _skipped(name):
            continue
        try:
            snaps.append((m, dict(m.__dict__)))
        except Exception:  # noqa: BLE001 - anything exotic is simply not tracked
            pass
    return snaps


_SKIP_PACKAGES += ("pyodide_js",)
_MOD_SNAP = _snapshot_modules()
_STATS = {"restore_ms": 0.0, "modules_restored": 0, "modules_tracked": len(_MOD_SNAP)}


def _restore_modules():
    n = 0
    for m, snap in _MOD_SNAP:
        d = m.__dict__
        if len(d) != len(snap) or any(d.get(k, _MISSING) is not v for k, v in snap.items()):
            d.clear()
            d.update(snap)
            n += 1
    return n


def _restore(_b=_BDICT, _snap=_BUILTINS):
    # First restore builtins using only pre-bound objects (user code may have cleared them).
    _b.clear()
    _b.update(_snap)
    t = time.perf_counter()
    _STATS["modules_restored"] = _restore_modules()
    _STATS["restore_ms"] = round((time.perf_counter() - t) * 1000, 2)
    for k, v in _SYS_ATTRS.items():
        setattr(sys, k, v)
    sys.path[:] = _PATH
    sys.setrecursionlimit(_RECURSION)
    try:
        os.chdir(_CWD)
    except OSError:
        pass
    for name in [m for m in sys.modules if m not in _MODULES]:
        del sys.modules[name]


def _new_globals():
    return {"__name__": "__main__", "__builtins__": builtins, "__file__": MAIN}


def _write_main(code):
    with open(MAIN, "w", encoding="utf-8") as f:
        f.write(code)
    import linecache
    linecache.checkcache(MAIN)


def _format_exc(e):
    te = _TE.from_exception(e)
    te.stack[:] = [fs for fs in te.stack if fs.filename == MAIN]
    return "".join(te.format())


_RUNS = 0  # how many user programs this worker has run (a fresh grading worker reports 1)


async def run_user(code, mode="run", spec=None, seed=0):
    """Returns (status, error, extra_json)."""
    global _RUNS
    _RUNS += 1
    try:
        if mode == "check":
            return ("ok", None, _check(code, spec, seed))
        if mode == "run":
            _write_main(code)
            await eval_code_async(code, _new_globals(), filename=MAIN)
            return ("ok", None, None)
        if mode == "trace":
            return ("ok", None, _trace(code))
        if mode == "explain":
            return ("ok", None, _explain(code))
        if mode == "probe":
            return ("ok", None, json.dumps({"python": sys.version.split()[0], **_STATS}))
        return ("error", f"unknown mode {mode!r}", None)
    except SystemExit:
        return ("ok", None, None)
    except BaseException as e:  # noqa: BLE001 - we report everything to the learner
        return ("error", _format_exc(e), None)
    finally:
        _restore()


# ---------------------------------------------------------------- grading (F3.1: minimal; F3.2 replaces)
def _normalise(text):
    lines = text.replace("\r\n", "\n").rstrip("\n").split("\n")
    return "\n".join(line.rstrip() for line in lines)


def _check(code, spec_json, seed):
    """Grade in THIS (fresh) worker. Output is captured, never streamed to the learner."""
    import contextlib
    import io
    import random

    spec = json.loads(spec_json or "{}")
    kind = spec.get("kind")
    result = {"seed": seed, "worker_runs": _RUNS}
    if kind != "stdout":
        return json.dumps({**result, "passed": False, "error": f"unsupported check kind {kind!r}"})
    random.seed(seed)
    _write_main(code)
    buf = io.StringIO()
    err = None
    try:
        with contextlib.redirect_stdout(buf):
            exec(compile(code, MAIN, "exec"), _new_globals())
    except SystemExit:
        pass
    except BaseException as e:  # noqa: BLE001
        err = _format_exc(e)
    expected = spec.get("expected", "")
    actual = buf.getvalue()
    passed = err is None and _normalise(actual) == _normalise(expected)
    return json.dumps({**result, "passed": passed, "expected": expected, "actual": actual, "error": err})


def _probe():
    return json.dumps({"python": sys.version.split()[0], "preloaded_json": "json" in _MODULES})


# ---------------------------------------------------------------- tracer prototype (§3.3)
class _StopTrace(Exception):
    pass


def _trace(code, max_steps=1000, max_objs=200):
    prim = (int, float, str, bool, type(None))
    steps, keepalive = [], []  # keepalive: id() values can't be reused while tracing

    def enc(v, heap, queue):
        if isinstance(v, prim):
            return v[:100] if isinstance(v, str) else v
        i = id(v)
        if i not in heap and len(heap) < max_objs:
            heap[i] = None
            queue.append(v)
            keepalive.append(v)
        return {"ref": i}

    def snap(frame):
        heap, queue, frames = {}, [], []
        f = frame
        while f is not None and f.f_code.co_filename == MAIN:
            loc = {k: enc(v, heap, queue) for k, v in f.f_locals.items() if not k.startswith("__")}
            frames.append([f.f_code.co_name, f.f_lineno, loc])
            f = f.f_back
        while queue:
            o = queue.pop(0)
            if isinstance(o, (list, tuple, set)):
                heap[id(o)] = [type(o).__name__, [enc(x, heap, queue) for x in o]]
            elif isinstance(o, dict):
                heap[id(o)] = ["dict", [[enc(k, heap, queue), enc(v, heap, queue)] for k, v in o.items()]]
            else:
                heap[id(o)] = [type(o).__name__, repr(o)[:100]]
        return frames, heap

    def tracer(frame, event, arg):
        if frame.f_code.co_filename != MAIN:
            return None
        if event in ("line", "return", "exception"):
            if len(steps) >= max_steps:
                raise _StopTrace
            fr, hp = snap(frame)
            steps.append([event, frame.f_lineno, fr, hp])
        return tracer

    _write_main(code)
    co = compile(code, MAIN, "exec")
    g = _new_globals()
    truncated = False
    t = time.perf_counter()
    sys.settrace(tracer)
    try:
        exec(co, g)
    except _StopTrace:
        truncated = True
    finally:
        sys.settrace(None)
    trace_ms = (time.perf_counter() - t) * 1000
    t = time.perf_counter()
    blob = json.dumps(steps)
    json_ms = (time.perf_counter() - t) * 1000
    return json.dumps({"steps": len(steps), "truncated": truncated, "trace_ms": round(trace_ms, 1),
                       "json_ms": round(json_ms, 1), "json_kb": round(len(blob) / 1024, 1)})


# ---------------------------------------------------------------- variable-aware errors (F9)
def _explain(code):
    import stack_data  # loaded from same-origin wheels

    _write_main(code)
    g = _new_globals()
    try:
        exec(compile(code, MAIN, "exec"), g)
        return json.dumps({"error": None})
    except Exception as e:  # noqa: BLE001
        frames = []
        for fi in stack_data.FrameInfo.stack_data(e.__traceback__, collapse_repeated_frames=False):
            if fi.filename != MAIN:
                continue
            node = fi.executing.node
            frames.append({
                "line": fi.lineno,
                "executing": fi.executing.text() if node is not None else None,
                "vars": {v.name: repr(v.value) for v in fi.variables},
            })
        return json.dumps({"error": f"{type(e).__name__}: {e}", "frames": frames})
