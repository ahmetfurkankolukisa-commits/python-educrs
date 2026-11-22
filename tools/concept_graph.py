#!/usr/bin/env python3
"""Validate content/concepts.toml and (optionally) generate docs/01-concept-graph.md.

Standard library only (Python >= 3.11). F0 prototype; the production validator
will live in tools/content-validator (TypeScript + Zod) and must enforce the
same rules. Exit code is 1 when any ERROR is found, so CI can gate on it.

Usage:
    python3 tools/concept_graph.py               # validate only
    python3 tools/concept_graph.py --write-doc   # validate + regenerate the doc
"""
from __future__ import annotations

import re
import sys
import tomllib
from collections import defaultdict, deque
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "content" / "concepts.toml"
DOC = ROOT / "docs" / "01-concept-graph.md"

ROOT_CONCEPT = "intro.program"
ID_RE = re.compile(r"^[a-z][a-z0-9]*(\.[a-z0-9][a-z0-9-]*)+$")
DETECT_KINDS = {"behavioral", "ast", "exception", "predict"}
EXERCISES_PER_CONCEPT = 5
MAX_PREREQS = 4


class Report:
    def __init__(self) -> None:
        self.errors: list[str] = []
        self.warnings: list[str] = []

    def error(self, msg: str) -> None:
        self.errors.append(msg)

    def warn(self, msg: str) -> None:
        self.warnings.append(msg)


def load() -> dict:
    with DATA.open("rb") as f:
        return tomllib.load(f)


# ------------------------------------------------------------------ graph algorithms
def kahn_topo(nodes: list[str], prereqs: dict[str, list[str]]) -> tuple[list[str], set[str]]:
    """Kahn's algorithm. Returns (topological order, nodes left in cycles)."""
    indeg = {n: 0 for n in nodes}
    children: dict[str, list[str]] = defaultdict(list)
    for n in nodes:
        for p in prereqs[n]:
            if p in indeg:
                indeg[n] += 1
                children[p].append(n)
    queue = deque(sorted(n for n in nodes if indeg[n] == 0))
    order: list[str] = []
    while queue:
        n = queue.popleft()
        order.append(n)
        for c in sorted(children[n]):
            indeg[c] -= 1
            if indeg[c] == 0:
                queue.append(c)
    return order, {n for n in nodes if indeg[n] > 0}


def find_cycle(cyclic: set[str], prereqs: dict[str, list[str]]) -> list[str]:
    """Return one concrete cycle. Every node Kahn could not remove has a prereq
    that was not removed either, so walking prereqs inside `cyclic` must loop."""
    start = min(cyclic)
    path: list[str] = []
    pos: dict[str, int] = {}
    node = start
    while node not in pos:
        pos[node] = len(path)
        path.append(node)
        node = min(p for p in prereqs[node] if p in cyclic)
    cycle = path[pos[node]:]
    # path follows "depends on" edges; present it in learning order (prereq -> dependent)
    cycle.reverse()
    return cycle + [cycle[0]]


def ancestors(order: list[str], prereqs: dict[str, list[str]]) -> dict[str, set[str]]:
    """All transitive prerequisites of every node (computed in topological order)."""
    anc: dict[str, set[str]] = {}
    for n in order:
        s: set[str] = set()
        for p in prereqs[n]:
            s.add(p)
            s |= anc[p]
        anc[n] = s
    return anc


def longest_path_layers(order: list[str], prereqs: dict[str, list[str]]) -> dict[str, int]:
    layer: dict[str, int] = {}
    for n in order:
        layer[n] = 1 + max((layer[p] for p in prereqs[n]), default=-1)
    return layer


def transitive_reduction(nodes: list[str], edges: set[tuple[str, str]]) -> set[tuple[str, str]]:
    """Remove edges (a, b) where b is reachable from a through another path."""
    succ: dict[str, set[str]] = defaultdict(set)
    for a, b in edges:
        succ[a].add(b)

    def reachable(start: str, skip: tuple[str, str]) -> set[str]:
        seen: set[str] = set()
        stack = [start]
        while stack:
            x = stack.pop()
            for y in succ[x]:
                if (x, y) == skip or y in seen:
                    continue
                seen.add(y)
                stack.append(y)
        return seen

    return {(a, b) for a, b in edges if b not in reachable(a, (a, b))}


# ------------------------------------------------------------------ validation
def validate(data: dict, r: Report) -> dict:
    modules = [m["id"] for m in data.get("module", [])]
    mod_index = {m: i for i, m in enumerate(modules)}
    mod_title = {m["id"]: m["title"] for m in data.get("module", [])}
    concepts = data.get("concept", [])
    misconceptions = data.get("misconception", [])
    projects = data.get("project", [])

    if data.get("schema") != 1:
        r.error("schema must be 1")

    # ids
    seen: set[str] = set()
    for kind, items in (("concept", concepts), ("misconception", misconceptions), ("project", projects)):
        for it in items:
            i = it.get("id", "")
            if i in seen:
                r.error(f"duplicate id: {i}")
            seen.add(i)
            if not ID_RE.match(i):
                r.error(f"bad {kind} id format: {i!r}")

    by_id = {c["id"]: c for c in concepts}
    ids = list(by_id)
    prereqs = {c["id"]: list(c.get("prereqs", [])) for c in concepts}
    track = {c["id"]: c.get("track") for c in concepts}

    for c in concepts:
        cid = c["id"]
        for field in ("module", "title", "summary"):
            if not c.get(field):
                r.error(f"{cid}: missing {field}")
        if c.get("module") not in mod_index:
            r.error(f"{cid}: unknown module {c.get('module')!r}")
        if len(set(prereqs[cid])) != len(prereqs[cid]):
            r.error(f"{cid}: duplicate prereq")
        if len(prereqs[cid]) > MAX_PREREQS:
            r.warn(f"{cid}: {len(prereqs[cid])} prereqs (> {MAX_PREREQS}); consider splitting the concept")
        for p in prereqs[cid]:
            if p == cid:
                r.error(f"{cid}: depends on itself")
            elif p not in by_id:
                r.error(f"{cid}: unknown prereq {p!r}")
    if r.errors:
        return {}

    # DAG
    order, cyclic = kahn_topo(ids, prereqs)
    if cyclic:
        r.error(f"cycle: {' -> '.join(find_cycle(cyclic, prereqs))} "
                f"({len(cyclic)} concepts blocked)")
        return {}

    # module order + tracks
    for cid in ids:
        mi = mod_index[by_id[cid]["module"]]
        for p in prereqs[cid]:
            pi = mod_index[by_id[p]["module"]]
            if pi > mi:
                r.error(f"{cid} ({by_id[cid]['module']}) depends on later module: {p} ({by_id[p]['module']})")
            if track[p] and track[p] != track[cid]:
                r.error(f"{cid} depends on optional track concept {p} ({track[p]})")

    # single root + reachability
    roots = [c for c in ids if not prereqs[c]]
    if roots != [ROOT_CONCEPT]:
        r.error(f"roots must be exactly [{ROOT_CONCEPT}], found {roots}")
    anc = ancestors(order, prereqs)
    unreachable = [c for c in ids if c != ROOT_CONCEPT and ROOT_CONCEPT not in anc[c]]
    if unreachable:
        r.error(f"not reachable from {ROOT_CONCEPT}: {unreachable}")

    # transitive redundancy: prereq p of c is redundant if another prereq q already needs p
    for cid in ids:
        for p in prereqs[cid]:
            via = [q for q in prereqs[cid] if q != p and p in anc[q]]
            if via:
                r.error(f"{cid}: redundant prereq {p} (already required via {via[0]})")

    # empty modules (M20 is projects-only by design)
    used = {by_id[c]["module"] for c in ids}
    for m in modules:
        if m not in used and m != "M20":
            r.error(f"module {m} has no concepts")

    # misconceptions
    for mc in misconceptions:
        if mc.get("detect") not in DETECT_KINDS:
            r.error(f"{mc['id']}: detect must be one of {sorted(DETECT_KINDS)}")
        for c in mc.get("concepts", []):
            if c not in by_id:
                r.error(f"{mc['id']}: unknown concept {c!r}")
        if not mc.get("belief"):
            r.error(f"{mc['id']}: missing belief")

    # projects: requirements exist and are taught by the project's module
    for pr in projects:
        pm = mod_index.get(pr.get("module"))
        if pm is None:
            r.error(f"{pr['id']}: unknown module {pr.get('module')!r}")
            continue
        for c in pr.get("requires", []):
            if c not in by_id:
                r.error(f"{pr['id']}: unknown concept {c!r}")
                continue
            if mod_index[by_id[c]["module"]] > pm:
                r.error(f"{pr['id']} ({pr['module']}) requires later concept {c} ({by_id[c]['module']})")
            if track[c] and track[c] != pr.get("track"):
                r.error(f"{pr['id']} requires optional track concept {c}")

    layer = longest_path_layers(order, prereqs)
    return dict(
        modules=modules, mod_index=mod_index, mod_title=mod_title, by_id=by_id,
        ids=ids, prereqs=prereqs, track=track, order=order, anc=anc, layer=layer,
        misconceptions=misconceptions, projects=projects,
    )


# ------------------------------------------------------------------ stats + doc
def stats(g: dict) -> dict:
    ids, layer, by_id, track = g["ids"], g["layer"], g["by_id"], g["track"]
    core = [c for c in ids if not track[c]]
    width = defaultdict(int)
    for c in ids:
        width[layer[c]] += 1
    covered = {c for mc in g["misconceptions"] for c in mc["concepts"]}
    dependents = defaultdict(int)
    for c in ids:
        for p in g["prereqs"][c]:
            dependents[p] += 1
    hubs = sorted(ids, key=lambda c: (-dependents[c], c))[:8]
    return dict(
        total=len(ids), core=len(core), optional=len(ids) - len(core),
        edges=sum(len(g["prereqs"][c]) for c in ids),
        depth=max(layer.values()), max_width=max(width.values()),
        misconceptions=len(g["misconceptions"]), projects=len(g["projects"]),
        mc_coverage=len(covered), exercises=len(ids) * EXERCISES_PER_CONCEPT,
        hubs=[(h, dependents[h]) for h in hubs],
        per_module={m: sum(1 for c in ids if by_id[c]["module"] == m) for m in g["modules"]},
    )


def module_mermaid(g: dict) -> str:
    by_id, mod_index = g["by_id"], g["mod_index"]
    edges: set[tuple[str, str]] = set()
    for c in g["ids"]:
        if g["track"][c]:
            continue
        for p in g["prereqs"][c]:
            a, b = by_id[p]["module"], by_id[c]["module"]
            if a != b:
                edges.add((a, b))
    red = transitive_reduction(g["modules"], edges)
    lines = ["```mermaid", "flowchart TD"]
    for m in g["modules"]:
        if m == "M20":
            continue
        lines.append(f'  {m}["{m} · {g["mod_title"][m]}"]')
    for a, b in sorted(red, key=lambda e: (mod_index[e[0]], mod_index[e[1]])):
        lines.append(f"  {a} --> {b}")
    lines.append("```")
    return "\n".join(lines)


def md_escape(s: str) -> str:
    return s.replace("|", "\\|")


def write_doc(g: dict, st: dict, r: Report) -> None:
    by_id, prereqs, layer = g["by_id"], g["prereqs"], g["layer"]
    mc_by_concept = defaultdict(list)
    for mc in g["misconceptions"]:
        for c in mc["concepts"]:
            mc_by_concept[c].append(mc["id"])

    out: list[str] = []
    w = out.append
    w("# Kavram Grafiği (F0)")
    w("")
    w("> ⚙️ **Bu belge otomatik üretilir. Elle düzenlemeyin.**")
    w("> Kaynak: `content/concepts.toml` · Üretici ve doğrulayıcı: `tools/concept_graph.py --write-doc`")
    w("")
    w("## 1. Tasarım kuralları")
    w("")
    w("- **Kavram = öğretilebilir tek fikir.** En az 5 farklı alıştırmayla ölçülebilmeli ve 10–20 dakikada öğretilebilmeli.")
    w("- **Kimlikler kalıcıdır** (`modül.kavram`). Bir kimlik asla yeniden kullanılmaz. Yeniden adlandırma bir takma ad (alias) tablosuyla yapılır (ana plan §2.3).")
    w("- **Önkoşullar sadece doğrudan ve gerekli olanlardır.** Başka bir önkoşul üzerinden zaten gelen bir bağlantı doğrulayıcı tarafından reddedilir. Böylece harita sade kalır ve seçici (§3.4) doğru çalışır.")
    w("- **Modül sırası korunur:** Bir kavram, sonraki bir modüldeki kavrama bağımlı olamaz.")
    w("- **İsteğe bağlı kollar** (🎨 yaratıcı kodlama gibi) ana yolu asla bloklamaz.")
    w("- **Tek kök:** Her kavram `intro.program`'dan erişilebilir olmalı.")
    w("- **Yanılgılar kavramlara bağlıdır.** Her yanılgının bir tespit yöntemi vardır (ana plan §3.2): `behavioral` (davranışsal eşleşme), `ast` (kod kalıbı), `exception` (hata türü ve bağlamı), `predict` (çıktı tahmini alıştırmalarıyla öğretilir).")
    w("")
    w("## 2. Doğrulama sonucu")
    w("")
    if r.errors:
        w(f"❌ **{len(r.errors)} hata**")
        for e in r.errors:
            w(f"- {md_escape(e)}")
    else:
        w("✅ **Hata yok.** DAG (Kahn), tek kök, erişilebilirlik, modül sırası, kol izolasyonu, gereksiz önkoşul, yanılgı ve proje referansları kontrol edildi.")
    if r.warnings:
        w("")
        w(f"⚠️ **{len(r.warnings)} uyarı**")
        for x in r.warnings:
            w(f"- {md_escape(x)}")
    w("")
    w("## 3. Sayılar")
    w("")
    w("| Ölçü | Değer |")
    w("|---|---|")
    w(f"| Kavram | **{st['total']}** (ana yol {st['core']} + isteğe bağlı {st['optional']}) |")
    w(f"| Önkoşul bağlantısı | {st['edges']} |")
    w(f"| En uzun önkoşul zinciri (derinlik) | {st['depth']} adım |")
    w(f"| En geniş katman | {st['max_width']} kavram (aynı anda açık olabilecek seçenek sayısının üst sınırı) |")
    w(f"| Yanılgı | {st['misconceptions']} (bunlarla bağlantılı {st['mc_coverage']} kavram) |")
    w(f"| Proje | {st['projects']} |")
    w(f"| Tahmini alıştırma sayısı | ~{st['exercises']} (kavram başına {EXERCISES_PER_CONCEPT}) |")
    w("")
    w("**En çok bağımlılık taşıyan kavramlar** (iyi öğretilmeleri en kritik olanlar):")
    w("")
    w(", ".join(f"`{h}` ({n})" for h, n in st["hubs"]))
    w("")
    w("## 4. Modül haritası")
    w("")
    w("Modüller arası bağımlılıklar. Diyagramı sade tutmak için transitif indirgeme uygulandı: dolaylı olarak zaten gelen oklar gösterilmiyor. M20 sadece projelerden oluşur.")
    w("")
    w(module_mermaid(g))
    w("")
    w("## 5. Kavramlar")
    w("")
    for m in g["modules"]:
        cs = [c for c in g["order"] if by_id[c]["module"] == m]
        if not cs:
            continue
        w(f"### {m} · {g['mod_title'][m]} ({len(cs)})")
        w("")
        w("| Kimlik | Başlık | Önkoşullar | Katman | Yanılgılar |")
        w("|---|---|---|---|---|")
        for c in cs:
            mark = " 🎨" if g["track"][c] else ""
            pre = ", ".join(f"`{p}`" for p in prereqs[c]) or "—"
            mcs = ", ".join(f"`{x}`" for x in mc_by_concept[c]) or ""
            w(f"| `{c}`{mark} | {md_escape(by_id[c]['title'])} | {pre} | {layer[c]} | {mcs} |")
        w("")
    w("## 6. Yanılgı kataloğu")
    w("")
    w("| Kimlik | Yanlış inanç | Kavram | Tespit |")
    w("|---|---|---|---|")
    for mc in g["misconceptions"]:
        cs = ", ".join(f"`{c}`" for c in mc["concepts"])
        w(f"| `{mc['id']}` | {md_escape(mc['belief'])} | {cs} | {mc['detect']} |")
    w("")
    w("## 7. Projeler")
    w("")
    w("| Kimlik | Modül | Başlık | Gerektirdiği kavramlar |")
    w("|---|---|---|---|")
    for pr in g["projects"]:
        mark = " 🎨" if pr.get("track") else ""
        req = ", ".join(f"`{c}`" for c in pr["requires"])
        w(f"| `{pr['id']}`{mark} | {pr['module']} | {md_escape(pr['title'])} | {req} |")
    w("")
    DOC.write_text("\n".join(out), encoding="utf-8")


def main() -> int:
    r = Report()
    g = validate(load(), r)
    for e in r.errors:
        print(f"ERROR  {e}")
    for x in r.warnings:
        print(f"WARN   {x}")
    if g:
        st = stats(g)
        print(f"OK     {st['total']} concepts, {st['edges']} edges, depth {st['depth']}, "
              f"{st['misconceptions']} misconceptions, {st['projects']} projects")
        if "--write-doc" in sys.argv:
            write_doc(g, st, r)
            print(f"WROTE  {DOC.relative_to(ROOT)}")
    return 1 if r.errors else 0


if __name__ == "__main__":
    sys.exit(main())
