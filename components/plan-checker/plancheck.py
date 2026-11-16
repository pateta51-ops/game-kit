"""Consistency checks for a board-game build plan (Markdown), game-independent.

Checks:
- balanced code fences;
- every table-of-contents anchor `](#...)` names a heading;
- every section reference (§N.N) resolves to a numbered heading;
- every table row has the header's column count, and no code span inside a table holds an unescaped pipe;
- every ```json block parses;
- IDs are defined once: an ID is "defined" where it appears bolded (**ABC-01**) or as the first cell of a table row,
  anywhere outside the scenario catalogue (rules, interpretations IR-nn, invariants INV-nn, decisions Dn, leads L-nn,
  VERIFY V-nn, exceptions CARD-nnn...). An ID defined more than once is reported;
- every ID a scenario cites (the second column of the scenario catalogue tables) is defined; ranges (`SET-01…11`,
  `SET-01–SET-11`), slash lists (`ACT-01/02/05`) and family wildcards (`RSH-*`) are expanded or matched;
- every scenario (SC-...) is referenced by some phase in the implementation-phases section;
- the session plan: every phase heading ("#### Phase N — ...") in the implementation-phases section appears in exactly
  one batch row of the session-plan summary table (first column the batch id, a "Phases" column with comma-separated
  phase ids, ranges like `2–4` allowed), every batch names a phase that exists, and every row has a non-empty "Model"
  cell and a "Confidence" cell holding a percentage; the Worker, Touches, Gate and Owner columns are filled (a NOTE,
  not a problem, when an older plan lacks a column);
- every experience feature (XP-nn) defined in the plan names an existing phase or "Roadmap" in the last cell of its
  table row, or is cited in the phases section or under a Roadmap heading;

Extraction (prints and exits, no checks):
  --section 5.3   one numbered section
  --batch S4      a worker's order: the shared preamble, the batch block, its phase blocks, and the line ranges of
                  the sections those phases list under "Read first"

Checks, continued:
- with --sessions-optional: a plan with no session-plan heading is not a problem (the session checks still run when
  the heading is there);
- with --scenarios-end TEXT: the scenario catalogue runs up to the heading for TEXT, so sibling headings that continue
  it ("10.4.1 ...") are read too;
- with --cover TEXT: every id defined in the section for TEXT (bolded, or first in a table row when its family
  is in --cover-rows IR,ICON; a word may end the id, as in ICON-TRAIN) appears in the scenario catalogue;
  --cover-skip P2,XP leaves out those families;
- with --tsc: the ```ts blocks of the type-definitions section compile under strict flags (needs `tsc` on PATH or in
  ./node_modules/.bin). --types "A;B..C;D" compiles several sections as one file, in the order given; "B..C" runs
  from the heading for B up to the heading for C. --tsc-stub TEXT adds TEXT as a last line (a type the plan leaves
  to the code).

Sections are found by heading keywords (case-insensitive); override them if your plan names them differently:
  --scenarios "Scenario catalogue"  --phases "Implementation phases"  --types "Type definitions"
  --sessions "Session plan"

Warnings (never fail; skipped quietly when no game-kit checkout is found: --kit PATH, else C:/projects/game-kit or
~/game-kit): the kit pin (kit/kit.lock.json beside the plan's docs folder, else a "kit ... pin ... vX.Y.Z" line) is 5+
minor versions behind the latest kit tag; a "Phase GKnn" heading or its "targets" lines name a K row that the kit's
docs/PLAN.md marks done.

Usage: python plancheck.py docs/BUILD_PLAN.md [--tsc] [--scenarios TEXT] [--phases TEXT] [--types TEXT] [--tsc-stub TEXT]
       [--sessions TEXT] [--sessions-optional] [--scenarios-end TEXT] [--cover TEXT] [--cover-rows A,B]
       [--cover-skip A,B]
Exit code 0 when no problems were found.
"""
from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

# An ID: uppercase family segments, then a number. Examples: KW-ACQ-02, BOT-RES-10, SET-01, IR-07, INV-03, V-12,
# CARD-001, L-05. Lowercase-free so prose words never match.
ID = r"(?:[A-Z][A-Z0-9]*-)+\d{1,3}"
RANGE_CHARS = "…–-"
# Source citations look like ids (FAQ #1, RB p.12) but are not; strip them before scanning a scenario's rules cell.
CITATION = re.compile(r"\b[A-Z]{2,5}\s*#[\d–\-/, ]+|\b[A-Z]{2,4} pp?\.[\d–\-, ]+")


def safe_console() -> None:
    """A Windows console in a legacy code page cannot print § or …: replace what it cannot encode, never crash."""
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(errors="replace")  # type: ignore[union-attr]
        except (AttributeError, ValueError):
            pass


def anchor(h: str) -> str:
    a = re.sub(r"[^\w\- ]", "", h.strip().lower())
    return a.replace(" ", "-")


def opt(name: str, default: str) -> str:
    if name in sys.argv:
        i = sys.argv.index(name)
        if i + 1 < len(sys.argv):
            return sys.argv[i + 1]
    return default


def headings(lines: list[str]) -> list[tuple[int, int, str]]:
    """(line index, level, text) of every heading outside code fences."""
    out, in_code = [], False
    for i, l in enumerate(lines):
        if l.strip().startswith("```"):
            in_code = not in_code
            continue
        if not in_code:
            m = re.match(r"^(#{1,6})\s+(.*)$", l)
            if m:
                out.append((i, len(m.group(1)), m.group(2).strip()))
    return out


def find_heading(heads: list[tuple[int, int, str]], keyword: str) -> int | None:
    """Index of the heading for `keyword`: the first whose text starts with it (after any numbering), else the
    first that merely contains it. So "11.4 Session plan" wins over "§11 Implementation phases and session plan"."""
    kw, best = keyword.lower(), None
    for k, (_, _, text) in enumerate(heads):
        low = text.lower()
        if kw in low:
            if re.sub(r"^[§\d.\s—–-]+", "", low).startswith(kw):
                return k
            if best is None:
                best = k
    return best


def section(lines: list[str], heads: list[tuple[int, int, str]], keyword: str) -> str:
    """The text of the heading `find_heading` picks for `keyword`, up to the next heading of the same or a higher
    level."""
    k = find_heading(heads, keyword)
    if k is None:
        return ""
    i, lvl, _ = heads[k]
    end = next((j for j, l2, _ in heads[k + 1:] if l2 <= lvl), len(lines))
    return "\n".join(lines[i:end])


def section_headings(heads: list[tuple[int, int, str]], keyword: str) -> list[tuple[int, int, str]]:
    """The headings nested under the heading `find_heading` picks for `keyword` (the same span as `section`)."""
    k = find_heading(heads, keyword)
    if k is None:
        return []
    lvl, out = heads[k][1], []
    for h in heads[k + 1:]:
        if h[1] <= lvl:
            break
        out.append(h)
    return out


def phase_tokens(cell: str) -> list[str]:
    """Phase ids in a batch row's Phases cell: `0, 1`, `S0`, `5a, 5b`, `2–4` (numeric ranges expanded)."""
    out: list[str] = []
    cell = re.sub(rf"(\w)\s*([{RANGE_CHARS}])\s*(\w)", r"\1\2\3", cell)
    for part in re.split(r"[,;+]|\s+and\s+|\s+", cell.strip()):
        part = part.strip().strip("`*")
        if not part or part.lower() in ("phase", "phases", "none", "-", "–", "—"):
            continue
        m = re.fullmatch(rf"(\d+)[{RANGE_CHARS}](\d+)", part)
        if m and int(m.group(2)) >= int(m.group(1)):
            out += [str(n) for n in range(int(m.group(1)), int(m.group(2)) + 1)]
        else:
            out.append(part)
    return out


def expand_ids(text: str) -> list[str]:
    """Every id token in `text`, with `X-01…11`, `X-01…X-11`, `X-01–11` and `X-01/02/05` expanded."""
    out: list[str] = []
    pat = re.compile(rf"\b((?:[A-Z][A-Z0-9]*-)+)(\d+)((?:/\d+)*)(?:\s*[{RANGE_CHARS}]\s*(?:\1)?(\d+))?(?![\w-])")
    for m in pat.finditer(text):
        prefix, first, slashes, last = m.group(1), m.group(2), m.group(3), m.group(4)
        width = len(first)
        nums = [first] + [s for s in slashes.split("/") if s]
        if last is not None and int(last) >= int(first):
            nums = [str(n).zfill(width) for n in range(int(first), int(last) + 1)]
        out += [f"{prefix}{n}" for n in nums]
    return out


def table_cells(l: str) -> list[str]:
    out, cur, esc = [], "", False
    for ch in l.strip().strip("|"):
        if ch == "|" and not esc:
            out.append(cur)
            cur = ""
        else:
            cur += ch
        esc = ch == "\\"
    out.append(cur)
    return out


def span_of(lines: list[str], heads: list[tuple[int, int, str]], k: int) -> tuple[int, int]:
    i, lvl, _ = heads[k]
    return i, next((j for j, l2, _ in heads[k + 1:] if l2 <= lvl), len(lines))


def numbered(heads: list[tuple[int, int, str]], num: str) -> int | None:
    return next((k for k, (_, _, t) in enumerate(heads) if re.match(rf"§?\s*{re.escape(num)}(?![\d.]*\d)", t)), None)


def extract(path: Path, lines: list[str], heads: list[tuple[int, int, str]]) -> int:
    """--section N.N prints one numbered section. --batch ID prints a worker's order: the shared preamble, the
    batch block, its phase blocks, and the line ranges of the sections those phases list under "Read first"."""
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    except (AttributeError, ValueError):
        pass

    def show(k: int) -> str:
        a, b = span_of(lines, heads, k)
        return "\n".join(lines[a:b]).rstrip() + "\n"
    if "--section" in sys.argv:
        k = numbered(heads, opt("--section", "").lstrip("§"))
        if k is None:
            print(f"no section {opt('--section', '')}")
            return 1
        print(show(k))
        return 0
    bid = opt("--batch", "")
    kb = next((k for k, (_, _, t) in enumerate(heads) if re.match(rf"Batch\s+{re.escape(bid)}\b", t)), None)
    if kb is None:
        print(f"no 'Batch {bid}' heading")
        return 1
    toks: list[str] = []
    header: list[str] = []
    for l in section(lines, heads, opt("--sessions", "Session plan")).split("\n"):
        if l.strip().startswith("|"):
            cells = [c.strip() for c in table_cells(l)]
            if any("phase" in c.lower() for c in cells) and cells[0].lower().startswith("batch"):
                header = [c.lower() for c in cells]
            elif header and cells[0].strip("`*") == bid and len(cells) == len(header):
                toks = phase_tokens(cells[next(i for i, c in enumerate(header) if "phase" in c)])
    out = []
    kp = find_heading(heads, "Shared preamble")
    if kp is not None:
        out.append(show(kp))
    out.append(show(kb))
    reads: list[str] = []
    briefs: list[str] = []

    def read_refs(text: str) -> None:
        on = False
        for l in text.split("\n"):
            if "read first" in l.lower():
                on = True
            elif on and (not l.strip() or l.lstrip().startswith(("**", "#"))):
                on = False
            if on:
                briefs.extend(re.findall(r"BRIEF\s*§(\d+(?:\.\d+)*)", l))
                reads.extend(re.findall(r"(?<!BRIEF )(?<!BRIEF)§(\d+(?:\.\d+)*)", l))

    read_refs(out[-1])
    for t in toks:
        k = next((k for k, (_, _, h) in enumerate(heads) if re.match(rf"Phase\s+{re.escape(t)}\b", h)), None)
        if k is None:
            out.append(f"(no 'Phase {t}' heading)\n")
            continue
        body = show(k)
        out.append(body)
        read_refs(body)
    print("\n".join(out))
    for r in dict.fromkeys(briefs):
        print(f"BRIEF §{r}: section {r} of docs/experience/BRIEF.md")
    if reads:
        print(f'"Read first" sections in {path} (Read with these line ranges, or --section N.N):')
        for r in dict.fromkeys(reads):
            k = numbered(heads, r)
            if k is None:
                print(f"  §{r}: not found")
            else:
                a, b = span_of(lines, heads, k)
                print(f"  §{r}: lines {a + 1}-{b}  {heads[k][2]}")
    return 0


def kit_warnings(path: Path, lines: list[str]) -> set[str]:
    out: set[str] = set()
    kit = None
    for c in ([Path(opt("--kit", ""))] if "--kit" in sys.argv else [Path("C:/projects/game-kit"), Path.home() / "game-kit"]):
        if (c / "docs" / "PLAN.md").is_file():
            kit = c
            break
    if kit is None:
        return out
    try:
        tags = subprocess.run(["git", "-C", str(kit), "tag"], capture_output=True, text=True, encoding="utf-8").stdout.split()
    except OSError:
        return out
    ver = lambda t: tuple(int(x) for x in re.findall(r"\d+", t)[:3])
    tags = [t for t in tags if re.fullmatch(r"v\d+\.\d+\.\d+", t)]
    if tags:
        latest = max(tags, key=ver)
        pin = None
        lock = path.resolve().parent.parent / "kit" / "kit.lock.json"
        if lock.is_file():
            try:
                refs = [c.get("ref", "") for c in json.loads(lock.read_text(encoding="utf-8")).get("components", {}).values()]
                refs = [r for r in refs if re.fullmatch(r"v\d+\.\d+\.\d+", r)]
                pin = min(refs, key=ver) if refs else None
            except (ValueError, AttributeError):
                pass
        if pin is None:
            for l in lines:
                if re.search(r"kit.*pin|pin.*kit", l, re.I) and (m := re.search(r"v\d+\.\d+\.\d+", l)):
                    pin = m.group(0)
                    break
        if pin and (ver(latest)[0] > ver(pin)[0] or (ver(latest)[0] == ver(pin)[0] and ver(latest)[1] - ver(pin)[1] >= 5)):
            out.add(f"WARN kit pin {pin} is far behind the latest kit tag {latest}")
    done = {}
    for l in (kit / "docs" / "PLAN.md").read_text(encoding="utf-8").split("\n"):
        cells = [c.strip() for c in table_cells(l)] if l.startswith("|") else []
        if len(cells) > 2 and re.fullmatch(r"K\d+", cells[0]) and cells[-1].lower().startswith(("done", "covered")):
            done[cells[0]] = cells[-1]
    heads = headings(lines)
    for i, (k, _, h) in enumerate(heads):
        if not re.match(r"Phase GK\d+", h):
            continue
        end = heads[i + 1][0] if i + 1 < len(heads) else len(lines)
        text = h + "\n" + "\n".join(l for l in lines[k + 1:end] if re.search(r"\btargets?\b", l, re.I))
        for r in sorted(set(re.findall(r"\bK\d+\b", text))):
            if r in done:
                out.add(f"WARN {h.split(' ')[1]} targets kit row {r}, which the kit's PLAN marks {done[r]}")
    return out


def main() -> int:
    safe_console()
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    for flag in ("--scenarios", "--phases", "--types", "--sessions", "--section", "--batch", "--scenarios-end", "--cover",
                 "--cover-rows", "--cover-skip", "--tsc-stub", "--kit"):
        if flag in sys.argv:
            v = opt(flag, "")
            if v in args:
                args.remove(v)
    if not args:
        print(__doc__)
        return 2
    path = Path(args[0])
    src = path.read_text(encoding="utf-8")
    lines = src.split("\n")
    heads = headings(lines)
    if "--section" in sys.argv or "--batch" in sys.argv:
        return extract(path, lines, heads)
    problems: list[str] = []
    notes: set[str] = set()

    # --- code fences ---
    if sum(1 for l in lines if l.strip().startswith("```")) % 2:
        problems.append("unbalanced code fences")

    # --- anchors and § references ---
    anchors = {anchor(h) for _, _, h in heads}
    for t in re.findall(r"\]\(#([^)]+)\)", src):
        if t not in anchors:
            problems.append(f"broken anchor #{t}")
    numbered = {m.group(1) for _, _, h in heads if (m := re.match(r"^(\d+(?:\.\d+)*)", h))}
    for r in sorted({r for r in re.findall(r"(?<!BRIEF )(?<!BRIEF)§(\d+(?:\.\d+)*)", src) if r not in numbered}):
        problems.append(f"unresolved §{r}")

    # --- tables; collect first-cell definitions ---
    first_cell_defs: list[str] = []
    xp_rows: dict[str, str] = {}
    scen_sec = section(lines, heads, opt("--scenarios", "Scenario catalogue"))
    if scen_sec and "--scenarios-end" in sys.argv:
        ks, ke = find_heading(heads, opt("--scenarios", "Scenario catalogue")), find_heading(heads, opt("--scenarios-end", ""))
        if ke is None or ke <= ks:
            problems.append(f"--scenarios-end: no heading contains {opt('--scenarios-end', '')!r} after the catalogue")
        else:
            scen_sec = "\n".join(lines[heads[ks][0]:heads[ke][0]])
    scen_start = src.find(scen_sec) if scen_sec else -1
    scen_lines = range(src[:scen_start].count("\n"), src[:scen_start].count("\n") + scen_sec.count("\n") + 1) \
        if scen_sec else range(0)
    in_code, i = False, 0
    while i < len(lines):
        l = lines[i]
        if l.strip().startswith("```"):
            in_code = not in_code
            i += 1
            continue
        if (not in_code and l.strip().startswith("|") and i + 1 < len(lines)
                and re.match(r"^\|[\s\-:|]+\|$", lines[i + 1].strip())):
            n, j = len(table_cells(l)), i + 2
            while j < len(lines) and lines[j].strip().startswith("|"):
                cells = table_cells(lines[j])
                if len(cells) != n:
                    problems.append(f"line {j + 1}: table row has {len(cells)} cells, header has {n}")
                for span in re.findall(r"`[^`]*`", lines[j]):
                    if re.search(r"(?<!\\)\|", span):
                        problems.append(f"line {j + 1}: unescaped | inside code span {span}")
                if j not in scen_lines:
                    m = re.match(rf"^\s*\**({ID}|D\d+)\**", cells[0])
                    if m:
                        first_cell_defs.append(m.group(1))
                        if m.group(1).startswith("XP-"):
                            xp_rows[m.group(1)] = cells[-1]
                j += 1
            i = j
            continue
        i += 1

    # --- JSON blocks ---
    for k, block in enumerate(re.findall(r"```json\n(.*?)```", src, re.S), 1):
        try:
            json.loads(block)
        except Exception as ex:  # noqa: BLE001
            problems.append(f"json block {k}: {ex}")

    # --- bold definitions (outside the scenario catalogue), duplicates ---
    outside = src.replace(scen_sec, "") if scen_sec else src
    bold = re.findall(rf"^\s*[-*]\s+\*\*({ID})\*\*", outside, re.M)
    seen: set[str] = set()
    for b in bold + first_cell_defs:
        if b in seen:
            problems.append(f"{b} is defined more than once")
        seen.add(b)
    defined = seen
    families = {d.rsplit("-", 1)[0] for d in defined}

    # --- scenario citations ---
    rows = re.findall(r"^\|\s*(SC-[A-Z0-9-]+)\s*\|([^|\n]*)\|", scen_sec, re.M)
    scenarios = sorted({sc for sc, _ in rows})
    if not scen_sec:
        problems.append(f"no heading contains {opt('--scenarios', 'Scenario catalogue')!r} (use --scenarios)")
    for sc, cited in rows:
        cited = CITATION.sub(" ", cited)
        for fam in re.findall(r"\b((?:[A-Z][A-Z0-9]*-)*[A-Z][A-Z0-9]*)-\*", cited):
            if not any(f == fam or f.startswith(fam + "-") for f in families):
                problems.append(f"{sc}: no rule of the family {fam}-* is defined")
        for d in re.findall(r"\b(D\d+)\b", cited):
            if d not in defined:
                problems.append(f"{sc}: {d} is not a defined decision")
        for tok in expand_ids(cited):
            if tok.startswith("SC-"):
                continue
            if tok not in defined:
                problems.append(f"{sc}: {tok} is not defined")

    # --- --cover: every id of the rules section appears in the catalogue ---
    if "--cover" in sys.argv:
        rules = section(lines, heads, opt("--cover", ""))
        if not rules:
            problems.append(f"--cover: no heading contains {opt('--cover', '')!r}")
        wide = r"[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+"
        skip = tuple(x.strip() + "-" for x in opt("--cover-skip", "").split(",") if x.strip())
        fams = tuple(x.strip() + "-" for x in opt("--cover-rows", "").split(",") if x.strip())
        ids = set(re.findall(rf"\*\*({wide})\*\*", rules)) | {
            d for d in re.findall(rf"^\|\s*\**({wide})\**\s*\|", rules, re.M) if d.startswith(fams or ("~",))}
        cited = set(expand_ids(scen_sec)) | set(re.findall(rf"(?<![\w-])({wide})(?![\w-])", scen_sec))
        wild = tuple(f + "-" for f in re.findall(r"\b((?:[A-Z][A-Z0-9]*-)*[A-Z][A-Z0-9]*)-\*", scen_sec))
        for d in sorted(ids):
            if not d.startswith(skip or ("\0",)) and d not in cited and not d.startswith(wild or ("\0",)):
                problems.append(f"rule {d} is not covered by any scenario")

    # --- every scenario assigned to a phase ---
    phases = section(lines, heads, opt("--phases", "Implementation phases"))
    if not phases:
        problems.append(f"no heading contains {opt('--phases', 'Implementation phases')!r} (use --phases)")
    else:
        refs = {t for t in expand_ids(phases) if t.startswith("SC-")}
        for s in scenarios:
            if s not in refs:
                problems.append(f"{s} is not assigned to any phase")

    # --- session plan: every phase in exactly one batch; every batch has a model and a confidence ---
    sess_kw = opt("--sessions", "Session plan")
    sess = section(lines, heads, sess_kw)
    phase_ids: list[str] = []
    for _, _, h in section_headings(heads, opt("--phases", "Implementation phases")):
        m = re.match(r"Phase\s+([A-Za-z0-9]+)\b", h)
        if m:
            phase_ids.append(m.group(1))
    if phases and not sess:
        if "--sessions-optional" not in sys.argv:
            problems.append(f"no heading contains {sess_kw!r} (use --sessions)")
    elif sess and phases:
        where: dict[str, list[str]] = {p: [] for p in phase_ids}
        batches = 0
        in_code, slines, i = False, sess.split("\n"), 0
        while i < len(slines):
            l = slines[i]
            if l.strip().startswith("```"):
                in_code = not in_code
                i += 1
                continue
            if (not in_code and l.strip().startswith("|") and i + 1 < len(slines)
                    and re.match(r"^\|[\s\-:|]+\|$", slines[i + 1].strip())):
                header = [c.strip().lower() for c in table_cells(l)]
                cols = {name: next((k for k, c in enumerate(header) if name in c), None)
                        for name in ("phase", "model", "confidence")}
                j = i + 2
                if None in cols.values():
                    while j < len(slines) and slines[j].strip().startswith("|"):
                        j += 1
                    i = j
                    continue
                while j < len(slines) and slines[j].strip().startswith("|"):
                    cells = [c.strip() for c in table_cells(slines[j])]
                    if len(cells) == len(header):
                        batch = cells[0].strip("`*") or f"row {j + 1}"
                        batches += 1
                        toks = phase_tokens(cells[cols["phase"]])
                        if not toks:
                            problems.append(f"{batch}: no phases listed")
                        for t in toks:
                            if t in where:
                                where[t].append(batch)
                            else:
                                problems.append(f"{batch}: phase {t} has no 'Phase {t}' heading in the phases section")
                        if cells[cols["model"]].strip("-—– ") == "":
                            problems.append(f"{batch}: no model")
                        if not re.search(r"\d+\s*%", cells[cols["confidence"]]):
                            problems.append(f"{batch}: confidence is not a percentage")
                        for name, need in (("worker", r"claude|codex|director"), ("touches", r"\w"), ("gate", r"check|full"),
                                           ("owner", r"\S")):
                            c = next((k for k, h in enumerate(header) if name in h), None)
                            if c is None:
                                notes.add(f"session table has no '{name}' column (the architect schedules by it)")
                            elif not re.search(need, cells[c], re.I):
                                problems.append(f"{batch}: '{name}' cell is empty or not understood")
                    j += 1
                i = j
                continue
            i += 1
        if not batches:
            problems.append("session plan has no batch table (columns Batch, Phases, Model, Confidence)")
        else:
            for p, bs in where.items():
                if not bs:
                    problems.append(f"Phase {p} is in no batch")
                elif len(bs) > 1:
                    problems.append(f"Phase {p} is in {len(bs)} batches ({', '.join(bs)})")

    # --- experience features: every defined XP id has a phase or a roadmap entry ---
    road = "\n".join("\n".join(lines[slice(*span_of(lines, heads, k))]) for k, (_, _, t) in enumerate(heads)
                     if "roadmap" in t.lower())
    placed = set(expand_ids(phases)) | set(expand_ids(road))
    for d in sorted(defined):
        if d.startswith("XP-") and d not in placed:
            last = xp_rows.get(d, "")
            if "roadmap" in last.lower() or any(x in phase_ids for x in phase_tokens(last)):
                continue
            problems.append(f"{d} has no phase and no roadmap entry")

    # --- the type contract ---
    if "--tsc" in sys.argv:
        specs, blocks = opt("--types", "Type definitions").split(";"), []
        for spec in specs:
            a, _, b = (x.strip() for x in spec.partition(".."))
            if not a or (_ and not b):
                problems.append(f"--tsc: empty section name in --types {spec!r}")
                continue
            if b:
                ka, kb = find_heading(heads, a), find_heading(heads, b)
                types = "" if ka is None or kb is None or kb <= ka else "\n".join(lines[heads[ka][0]:heads[kb][0]])
            else:
                types = section(lines, heads, a)
            if not types and (b or len(specs) > 1):
                problems.append(f"--tsc: no section for {spec.strip()!r} (--types)")
            blocks += re.findall(r"```ts\n(.*?)```", types, re.S)
        code = "\n".join(blocks)
        if not code:
            problems.append("--tsc: no ```ts blocks found in the type-definitions section")
        else:
            if "--tsc-stub" in sys.argv:
                code += "\n" + opt("--tsc-stub", "") + "\n"
            local = Path("node_modules") / ".bin" / ("tsc.cmd" if sys.platform == "win32" else "tsc")
            tsc = str(local.resolve()) if local.exists() else shutil.which("tsc")
            if not tsc:
                problems.append("--tsc: TypeScript not found (npm i -D typescript, or install tsc globally)")
            else:
                with tempfile.TemporaryDirectory() as tmp:
                    f = Path(tmp) / "contract.ts"
                    f.write_text(code, encoding="utf-8")
                    r = subprocess.run(
                        [tsc, "--noEmit", "--strict", "--exactOptionalPropertyTypes", "--noUncheckedIndexedAccess",
                         "--noImplicitOverride", "--target", "es2022", "--module", "esnext", f.name],
                        cwd=tmp, capture_output=True, text=True, encoding="utf-8",
                    )
                    if r.returncode != 0:
                        problems.append("type contract does not compile:\n" + (r.stdout + r.stderr)[:3000])

    notes |= kit_warnings(path, lines)

    print(f"{path}: {len(lines)} lines, {len(defined)} defined IDs, {len(scenarios)} scenarios")
    for n in sorted(notes):
        print("NOTE", n)
    for p in problems:
        print("PROBLEM", p)
    print("OK" if not problems else f"{len(problems)} problem(s)")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
