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
- test depth (problems prefixed "depth:"; with --depth-optional they are NOTEs, for a plan written before 18 Nov 2026):
  the card-test section ("Card-language test programme") names expectNotOffered and has a depth table (columns
  Family, Full resolve, Poor setup) whose every row has a full-resolve depth and names expectNotOffered or
  expectNotFired in its Poor setup cell; the Definition of Done names expectNotOffered, "default-off" and
  "LLM playtest"; the test-layers section ("Layers") names "LLM playtest"; a phase block in the phases section names
  llm-playtester; the shared preamble names e2e and heavy (the machine queue);
- card encoding (problems prefixed "cards:"; with --cards-optional they are NOTEs, for a plan written before 20 Nov 2026
  only): the catalogue file exists (--catalogue PATH, else cards/catalogue.json beside the plan; contract
  {"summary": {"clauses": <int>}, "patterns": [{"id": "P-01", ...}, ...]}); the plan names ar-map.md; a "Modifier order"
  heading whose table rows each hold an AR-n or IR-n id (header and separator rows, and rows starting "<", skipped); the
  card-test section names cardCase and "interaction"; a "Screen-text scan" heading; the Definition of Done names
  cards:check, cards:screen and cards:whole-game; a phase block names cards:whole-game; the session table has Clauses
  and Patterns columns, no row over --max-clauses (default 40) clauses or --max-patterns (default 10) patterns (ids
  comma-separated), the Clauses cells sum to the catalogue's summary.clauses, and every catalogue pattern id is in a
  Patterns cell;
- game-kit reuse (problems prefixed "kit:"; with --kit-optional they are NOTEs, for a plan written before 21 Nov 2026
  only), read from the section whose heading contains "Reuse map" (--reuse TEXT), tables inside code fences skipped
  (cases: test_kit_checks.py beside this file):
  * the reuse map is each table whose header has Layer, Kind and Source cells; every Kind starts with Pull, Kit phase,
    Pattern, Port or New. A Pull row names in backticks at least one component of the kit at the pin (or the part a
    Kit phase row of this map builds), and a backticked lower-case name outside parentheses that is neither is a
    problem. The pin is the first vX.Y.Z on a line of the section that says pin, pinned or tag as a word, else
    kit/kit.lock.json's ref, else the first vX.Y.Z of the section; Pull rows with no pin at all are a problem. A NOTE
    always says whether the Pull rows were checked and against which tag. With no kit checkout (--kit PATH, $KIT_DIR,
    the checkout holding this script, ~/game-kit), the Pull rows are checked against the game's locked copy (K568):
    kit/ beside the plan's docs folder, or the folder holding this script, when it holds kit.lock.json; its parts are
    the lock's components, the folders holding component.json and every component kit/CATALOG.md lists (the whole
    kit at the lock's tag); a plan pin other than the lock's ref is a NOTE. A Kit phase row names a GK<n> that is a
    "Phase GK<n>" heading, and a new kit phase also has a build-own row;
  * a game sheet table (a header cell names "Game sheet") with a row for each line of references/game-sheet.md
    (SHEET_LINES; asked for only when the mechanics map is not checked), each with an answer, and with a backticked kit part or the words "build-own" in its third cell
    unless the answer starts "not in this game"; more than half the lines absent is a NOTE;
  * a build-own table (a header cell names "What the game builds"; columns: what, words searched, nearest kit part,
    verdict, register id or refusal) with a row for every New, Port and Pattern row of the reuse map by its Layer text,
    and a row starting "Game verbs" when a Source cell of the map names card-language or a heading contains "Effect
    language" (one "Game verbs: none" row is allowed, with the coverage diff's counts in its second cell). Every other
    row: two phrasings searched (two parts around a ";", or two quoted or backticked strings); a verdict cell that
    starts with kit phase, candidate or game code; for kit phase and candidate a K<n> id or "steward not asked" in the
    last cell; for game code a reason of six words or more; a kit phase with K<n> needs a "Phase GK<n>" heading;
  * the kit-fit review (plan-review/kit-fit.md beside the plan) exists, is not empty and names every build-own row;
  * a line starting "Kit steward's reply (" with a ">" line within the next three, unless every build-own row says
    "steward not asked";
  * every Modifier order row holds a backticked name or the words "build-own", in its "Kit function" cell when the
    table has one;
  * K531, the mechanics map (kit/recipes/mechanics.md beside the plan's docs folder, or --map PATH; skipped when the
    file is missing or with --sheet-optional): every map line has a game sheet row whose first cell, up to its first
    comma, equals the line's first phrase (the Mechanic cell up to its first comma; case and spaces ignored); the
    unanswered lines are one problem giving their count, their first phrases and how to fix it. A sheet row whose answer starts "kit part" and whose backticked names are all absent from the map line's
    Answer cell is a WARN; a plan with no game sheet table gets one WARN, not a problem;
  * a build-own row whose verdict is candidate and whose K<n> is a row the kit's docs/plan/K<n>.md marks "state: done"
    gets a WARN naming the part that closed it (its docs/mechanics.json line, else the row's first backticked name or
    leading "name:");

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
  to the code). --tsc-at DIR compiles the blocks as a file inside DIR (a folder of the game checkout, such as
  src/engine/types) instead of a temp folder, so relative imports like ../../kit/engine-core/index.ts resolve.

Sections are found by heading keywords (case-insensitive); override them if your plan names them differently:
  --scenarios "Scenario catalogue"  --phases "Implementation phases"  --types "Type definitions"
  --sessions "Session plan"  --cards "Card-language test programme"  --done "Definition of Done"  --layers "Layers"

Warnings (never fail; skipped quietly when no game-kit checkout is found: --kit PATH, else $KIT_DIR, the checkout holding this script or
~/game-kit): the kit pin (kit/kit.lock.json beside the plan's docs folder, else a "kit ... pin ... vX.Y.Z" line) is 5+
minor versions behind the latest kit tag; a "Phase GKnn" heading or its "targets" lines name a K row that the kit's
docs/PLAN.md marks done.

Usage: python plancheck.py docs/BUILD_PLAN.md [--tsc] [--scenarios TEXT] [--phases TEXT] [--types TEXT] [--tsc-stub TEXT]
       [--sessions TEXT] [--sessions-optional] [--scenarios-end TEXT] [--cover TEXT] [--cover-rows A,B]
       [--cover-skip A,B] [--tsc-at DIR] [--cards TEXT] [--done TEXT] [--layers TEXT] [--depth-optional]
       [--cards-optional] [--catalogue PATH] [--max-clauses N] [--max-patterns N] [--kit-optional] [--reuse TEXT] [--kit PATH]
       [--map PATH] [--sheet-optional]
Exit code 0 when no problems were found.
"""
from __future__ import annotations

import contextlib
import json
import os
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
                for m in re.finditer(r"(BRIEF\s*)?§((?:\d+\.)*)(\d+)\s*[-–]\s*§?\2(\d+)\b", l):  # a range of one major: every section in it
                    (briefs if m.group(1) else reads).extend(f"{m.group(2)}{i}" for i in range(int(m.group(3)) + 1, int(m.group(4))))

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


SHEET_LINES = ("who the player controls", "what can run out", "clocks and tracks", "the phase list", "where the opposition comes from",
               "dice", "positions", "numbers several cards change", "costs and payment", "may an effect be offered",
               "lasting effects and status", "triggers and windows", "cards as data", "hidden information", "objectives and scoring",
               "set-up picks", "between games", "loading the content", "attacks and damage", "tokens and markers",
               "levels and upgrades", "markets and rows")


def kit_dir() -> Path | None:
    for c in ([Path(opt("--kit", ""))] if "--kit" in sys.argv else ([Path(os.environ["KIT_DIR"])] if os.environ.get("KIT_DIR") else []) + [Path(__file__).resolve().parents[2], Path.home() / "game-kit"]):
        if (c / "docs" / "PLAN.md").is_file() and (c / "components").is_dir() and (c / "kit.mjs").is_file():
            return c
    return None


def kit_warnings(path: Path, lines: list[str]) -> set[str]:
    out: set[str] = set()
    kit = kit_dir()
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
                lk = json.loads(lock.read_text(encoding="utf-8")); refs = [lk["ref"]] if lk.get("ref") else [c.get("ref", "") for c in lk.get("components", {}).values()]
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
                 "--cover-rows", "--cover-skip", "--tsc-stub", "--kit", "--tsc-at", "--cards", "--done", "--layers",
                 "--catalogue", "--max-clauses", "--max-patterns", "--reuse", "--map"):
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
    cd: list[str] = []
    ch, csum, pids = [0, 0], 0, []
    maxc, maxp = int(opt("--max-clauses", "40")), int(opt("--max-patterns", "10"))
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
                cc, pc = (next((k for k, c in enumerate(header) if w in c), None) for w in ("clauses", "patterns"))
                ch[0] |= cc is not None
                ch[1] |= pc is not None
                while j < len(slines) and slines[j].strip().startswith("|"):
                    cells = [c.strip() for c in table_cells(slines[j])]
                    if len(cells) == len(header):
                        batch = cells[0].strip("`*") or f"row {j + 1}"
                        batches += 1
                        if cc is not None and cells[cc].strip("`*").isdigit():
                            csum += int(cells[cc].strip("`*"))
                            if int(cells[cc].strip("`*")) > maxc:
                                cd.append(f"{batch} has {cells[cc].strip('`*')} clauses (cap {maxc})")
                        if pc is not None:
                            ids = [x.strip("`* ") for x in cells[pc].split(",")]
                            ids = [x for x in ids if x.strip("-—– ")]
                            pids += ids
                            if len(ids) > maxp:
                                cd.append(f"{batch} has {len(ids)} patterns (cap {maxp})")
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

    # --- test depth: card tests per clause, default-off paths, the LLM playtest, e2e before review ---
    depth: list[str] = []
    cards = section(lines, heads, opt("--cards", "Card-language test programme"))
    if not cards:
        depth.append(f"no heading contains {opt('--cards', 'Card-language test programme')!r} (use --cards)")
    else:
        if "expectNotOffered" not in cards:
            depth.append("card tests: the poor-setup helper expectNotOffered is not named")
        nrows, hdr = 0, None
        for l in cards.split("\n"):
            cells = [c.strip() for c in table_cells(l)] if l.strip().startswith("|") else []
            if not cells:
                hdr = None
            elif hdr is None:
                hdr = tuple(next((k for k, c in enumerate(cells) if w in c.lower()), None) for w in ("family", "full", "poor"))
            elif None not in hdr and len(cells) > max(hdr) and not re.fullmatch(r"[\s:-]*", cells[0]):
                nrows += 1
                if not cells[hdr[1]].strip("-—– "):
                    depth.append(f"card tests: family {cells[0]!r} has no full-resolve depth")
                if not re.search(r"expectNot(Offered|Fired)", cells[hdr[2]]):
                    depth.append(f"card tests: family {cells[0]!r} names no poor-setup helper (expectNotOffered or expectNotFired); no family is exempt")
        if not nrows:
            depth.append("card tests: no depth table (columns Family, Full resolve, Poor setup)")
    done = section(lines, heads, opt("--done", "Definition of Done"))
    if not done:
        depth.append(f"no heading contains {opt('--done', 'Definition of Done')!r} (use --done)")
    for need, what in (("expectNotOffered", "the card-test depth gate (a poor test that calls expectNotOffered)"),
                       ("default-off", "the default-off paths"), ("llm playtest", "the LLM playtest")):
        if done and need.lower() not in done.lower():
            depth.append(f"the Definition of Done lacks {what}")
    if "llm playtest" not in section(lines, heads, opt("--layers", "Layers")).lower():
        depth.append(f"the test layers ({opt('--layers', 'Layers')!r}, use --layers) do not name the LLM playtest")
    kph = find_heading(heads, opt("--phases", "Implementation phases"))
    if kph is not None:
        a, b = span_of(lines, heads, kph)
        if not any("llm-playtester" in "\n".join(lines[slice(*span_of(lines, heads, k))])
                   for k, (i, _, t) in enumerate(heads) if a < i < b and re.match(r"Phase\s+\w", t)):
            depth.append("no phase builds the LLM playtest (the kit's llm-playtester)")
    kpre = find_heading(heads, "Shared preamble")
    pre = "\n".join(lines[slice(*span_of(lines, heads, kpre))]) if kpre is not None else ""
    if "e2e" not in pre.lower() or "heavy" not in pre:
        depth.append("the shared preamble does not send a changed flow through the e2e suites and the machine queue (e2e, heavy run)"
                     if pre else "no heading contains 'Shared preamble'")
    if "--depth-optional" in sys.argv:
        notes |= {f"depth: {d}" for d in depth}
    else:
        problems += [f"depth: {d}" for d in depth]

    # --- card encoding: catalogue, AR map, modifier order, screen-text scan, whole-game check, batch size ---
    cat = Path(opt("--catalogue", str(path.parent / "cards" / "catalogue.json")))
    if not cat.exists():
        cd.append(f"no catalogue ({cat}): stage 5b")
    if "ar-map.md" not in src:
        cd.append("the plan does not name ar-map.md")
    mo = section(lines, heads, "modifier order")
    if not mo:
        cd.append("no heading contains 'Modifier order'")
    ml = mo.split("\n")
    for n, l in enumerate(ml[:-1]):
        c0 = [c.strip() for c in table_cells(l)] if l.strip().startswith("|") else []
        if (c0 and re.match(r"^\|[\s\-:|]+\|$", ml[n + 1].strip()) is None and not re.fullmatch(r"[\s:-]*", c0[0])
                and not c0[0].startswith("<") and not re.search(r"\b(?:AR|IR)-\d+", l)):
            cd.append(f"Modifier order: row {c0[0]!r} has no AR or IR id")
    if "cardCase" not in cards or "interaction" not in cards.lower():
        cd.append("the card-test section does not name cardCase and 'interaction'")
    if find_heading(heads, "screen-text scan") is None:
        cd.append("no heading contains 'Screen-text scan'")
    for need in ("cards:check", "cards:screen", "cards:whole-game"):
        if need not in done:
            cd.append(f"the Definition of Done lacks {need}")
    if kph is not None and not any("cards:whole-game" in "\n".join(lines[slice(*span_of(lines, heads, k))])
                                   for k, (i, _, t) in enumerate(heads) if a < i < b and re.match(r"Phase\s+\w", t)):
        cd.append("no phase names cards:whole-game")
    for w, on in (("Clauses", ch[0]), ("Patterns", ch[1])):
        if not on:
            cd.append(f"the session table has no {w} column")
    if cat.exists():
        try:
            cj = json.loads(cat.read_text(encoding="utf-8"))
            tot, cp = cj["summary"]["clauses"], [p["id"] for p in cj["patterns"]]
            if ch[0] and tot != csum:
                cd.append(f"{tot} clauses in the catalogue, {csum} in batches")
            cd += [f"pattern {p} is in no batch" for p in cp if ch[1] and p not in pids]
        except Exception:  # noqa: BLE001
            cd.append(f"catalogue ({cat}) does not parse or lacks summary.clauses / patterns")
    if "--cards-optional" in sys.argv:
        notes |= {f"cards: {d}" for d in cd}
    else:
        problems += [f"cards: {d}" for d in cd]

    # --- game-kit reuse: pulls at the pin, the game sheet, the build-own table, the kit-fit review ---
    kd: list[str] = []
    norm = lambda c: re.sub(r"\s+", " ", re.sub(r"[*`]", "", c)).strip().lower()
    slug = r"`([a-z0-9]+(?:-[a-z0-9]+)*)`"
    named = lambda c: "`" in c or "build-own" in c.lower()
    ru = section(lines, heads, opt("--reuse", "Reuse map"))
    if not ru:
        kd.append(f"no heading contains {opt('--reuse', 'Reuse map')!r} (use --reuse)")
    tabs: dict[str, list[list[str]]] = {}
    seen: set[str] = set()
    th, fence, pos = None, False, (0, 1, 2)
    for l in ru.split("\n"):
        if l.strip().startswith(("```", "~~~")):
            fence = not fence
        cells = [c.strip() for c in table_cells(l)] if l.strip().startswith("|") and not fence else []
        if not cells:
            th = None
        elif th is None:
            low = [norm(c) for c in cells]
            th = ("sheet" if any("game sheet" in c for c in low) else "own" if any("what the game builds" in c for c in low)
                  else "map" if all(any(w in c for c in low) for w in ("layer", "kind", "source")) else "x")
            seen.add(th)
            if th == "map":
                pos = tuple(next(k for k, c in enumerate(low) if w in c) for w in ("layer", "kind", "source"))
        elif not all(re.fullmatch(r"[\s:-]*", c) for c in cells):
            trows = tabs.setdefault(th, [])
            if th == "map":
                if len(cells) <= max(pos):
                    continue
                cells = [cells[pos[0]], cells[pos[1]], cells[pos[2]], " ".join(cells)]
            if not norm(cells[0]) and trows:
                cells[0] = trows[-1][0]
            trows.append(cells)
    own, sheet, maprows = tabs.get("own", []), tabs.get("sheet", []), tabs.get("map", [])
    if ru and "map" not in seen:
        kd.append("the reuse map has no table with Layer, Kind and Source columns")
    kit, comps = kit_dir(), set()
    vs = [(m.group(0), l) for l in ru.split("\n") for m in [re.search(r"v\d+\.\d+\.\d+", l)] if m]
    tag = next((v for v, l in vs if re.search(r"\b(pin|pinned|tag)\b", l, re.I)), None)
    if not tag:
        with contextlib.suppress(Exception):
            tag = json.loads((path.resolve().parent.parent / "kit" / "kit.lock.json").read_text(encoding="utf-8")).get("ref")
    tag = tag or (vs[0][0] if vs else None)
    if not tag and any(norm(r[1]).startswith("pull") for r in maprows):
        kd.append("the reuse map names no kit pin (a line that says pin or tag, with vX.Y.Z)")
    if kit and tag:
        with contextlib.suppress(OSError):
            comps = set(subprocess.run(["git", "-C", str(kit), "ls-tree", "-d", "--name-only", tag + ":components"],
                                       capture_output=True, text=True, encoding="utf-8").stdout.split())
    locked = None if kit else next((d for d in (path.resolve().parent.parent / "kit", Path(__file__).resolve().parents[1]) if (d / "kit.lock.json").is_file()), None)
    if locked and tag:
        with contextlib.suppress(Exception):
            lk = json.loads((locked / "kit.lock.json").read_text(encoding="utf-8"))
            cat = locked / "CATALOG.md"
            comps = set(lk.get("components", {})) | ({d.name for d in locked.iterdir() if (d / "component.json").is_file()}) | (set(re.findall(r"\[`([a-z0-9-]+)`\]\(#", cat.read_text(encoding="utf-8"))) if cat.is_file() else set())
            if lk.get("ref") and lk["ref"] != tag:
                notes.add(f"kit: the plan pins {tag} but {locked / 'kit.lock.json'} holds {lk['ref']}: Pull rows checked against the locked copy")
            tag = lk.get("ref") or tag
        notes.add(f"kit: Pull rows checked against the locked copy {locked} at {tag} (no kit checkout; candidate rows not checked: --kit PATH or $KIT_DIR)" if comps else f"kit: Pull rows NOT checked (no kit checkout; the locked copy {locked} names no component)")
    else:
        notes.add(f"kit: Pull rows checked against {tag} in {kit}" if comps else "kit: Pull rows NOT checked ("
              + ("no kit checkout" if not kit else "no kit pin in the reuse map" if not tag else f"tag {tag} not in {kit}: git fetch --tags") + ")")
    ownset = {norm(o[0]) for o in own}
    phased = {n for r in maprows if norm(r[1]).startswith("kit phase") for n in re.findall(slug, r[2])}
    for layer, kindc, srcc, whole in maprows:
        kind, bare = norm(kindc), srcc
        if not kind.startswith(("pull", "kit phase", "pattern", "port", "new")):
            kd.append(f"reuse map: row {layer!r} has Kind {kindc!r} (use Pull, Kit phase, Pattern, Port or New)")
        if kind.startswith("pull") and comps:
            while (b2 := re.sub(r"\([^()]*\)", "", bare)) != bare:
                bare = b2
            if not set(re.findall(slug, srcc)) & (comps | phased):
                kd.append(f"reuse map: Pull row {layer!r} names no kit part of {tag}")
            kd += [f"reuse map: `{n}` (row {layer!r}) is no kit part at {tag}" for n in re.findall(slug, bare) if n not in comps and n not in phased]
        if kind.startswith("kit phase") and not any(re.match(rf"Phase {re.escape(g)}\b", t) for g in re.findall(r"\bGK\w+", whole) for _, _, t in heads):
            kd.append(f"reuse map: Kit phase row {layer!r} names no GK phase of this plan (GK<n> in the row, 'Phase GK<n>' as a heading)")
        if (kind.startswith(("new", "port", "pattern")) or (kind.startswith("kit phase") and "new" in kind)) and norm(layer) not in ownset:
            kd.append(f"reuse map: {'Kit phase' if kind.startswith('kit') else kind.split()[0].capitalize()} row {layer!r} is not in the build-own table")
    mp = Path(opt("--map", "")) if "--map" in sys.argv else path.resolve().parent.parent / "kit" / "recipes" / "mechanics.md"
    if "sheet" not in seen:
        kd.append("the reuse map has no game sheet table (a header cell names 'Game sheet'): stage 5")
    else:
        if "--sheet-optional" in sys.argv or not mp.is_file():
            kd += [f"game sheet: no row for the line {t!r}" for t in SHEET_LINES if not any(norm(r[0]).startswith(t) for r in sheet)]
        for r in sheet:
            ans = norm(r[1]) if len(r) > 1 else ""
            if not ans.strip("-—– "):
                kd.append(f"game sheet: line {r[0]!r} has no answer")
            elif not ans.startswith("not in this game") and (len(r) < 3 or not named(r[2])):
                kd.append(f"game sheet: line {r[0]!r} names no kit part (in backticks) and no build-own row")
        absent = [r[0] for r in sheet if len(r) > 1 and norm(r[1]).startswith("not in this game")]
        if len(absent) * 2 > len(SHEET_LINES):
            notes.add(f"kit: the game sheet says 'not in this game' on {len(absent)} lines: {', '.join(absent)}")
    # K531: the game sheet answers every line of the kit's mechanics map (kit/recipes/mechanics.md beside the docs folder, or --map)
    if "--sheet-optional" not in sys.argv and not mp.is_file() and "sheet" in seen:
        notes.add(f"kit: game sheet NOT checked against the mechanics map (no {mp}; --map PATH)")
    if "--sheet-optional" not in sys.argv and mp.is_file():
        if "sheet" not in seen:
            notes.add(f"WARN kit: the plan has no game sheet table, so it was not checked against the mechanics map {mp}")
        else:
            mrows, mh2 = [], False
            for l in mp.read_text(encoding="utf-8").splitlines():
                c = [x.strip() for x in table_cells(l)] if l.strip().startswith("|") else []
                if len(c) < 2 or re.fullmatch(r"[\s:-]*", c[0]):
                    continue
                if not mh2:
                    mh2 = True
                    continue
                mrows.append((norm(c[0]), set(re.findall(r"`([^`]+)`", c[1]))))
            first = lambda t: t.split(",")[0].strip()
            miss = []
            for mech, mnames in mrows:
                hit = [r for r in sheet if first(norm(r[0])) == first(mech)]
                if not hit:
                    miss.append(first(mech))
                for r in hit:
                    rn = set(re.findall(slug, " ".join(r[2:])))
                    if len(r) > 1 and norm(r[1]).startswith("kit part") and rn and not rn & mnames:
                        notes.add(f"WARN kit: game sheet line {r[0]!r} answers kit part {', '.join(sorted(rn))}, which the mechanics map's line does not name")
            if miss:
                kd.append(f"game sheet: {len(miss)} mechanics map line(s) unanswered: {', '.join(miss)}. Each mechanics map line needs its own row in the game sheet table, first cell = the line's first phrase; answer a kit part, a build-own row, or 'not in this game'")
            notes.add(f"kit: game sheet checked against the mechanics map {mp} ({len(mrows)} lines)")
    gv = [o for o in own if norm(o[0]).startswith("game verbs")]
    if "own" not in seen:
        kd.append("the reuse map has no build-own table (a header cell names 'What the game builds'): stage 5")
    elif not gv and (any("card-language" in r[2] for r in maprows) or find_heading(heads, "effect language") is not None):
        kd.append("build-own table: no 'Game verbs' row (one per family of the game's own verbs, or 'Game verbs: none' with the coverage diff's counts)")
    fit = path.parent / "plan-review" / "kit-fit.md"
    fitt = norm(fit.read_text(encoding="utf-8", errors="replace")) if fit.is_file() else ""
    if not fitt:
        kd.append(f"no kit-fit review ({fit} is missing or empty): stage 9")
    answered = False
    for o in own:
        o = o + [""] * (5 - len(o))
        name, v, last = norm(o[0]), norm(o[3]).replace("-", " "), o[4]
        if name.endswith(": none"):
            if name != "game verbs: none" or len(gv) > 1:
                kd.append(f"build-own table: {o[0]!r}: only one row, 'Game verbs: none', may say none")
            elif not re.search(r"\d", o[1]):
                kd.append("build-own table: 'Game verbs: none' gives no counts from the coverage diff in its second cell")
            continue
        asked, kid = "steward not asked" in last.lower(), re.search(r"\bK(\d+)\b", last)
        answered = answered or not asked
        if len([x for x in o[1].split(";") if re.search(r"[A-Za-z]", x)]) < 2 and len(re.findall(r"\"[^\"]+\"|`[^`]+`", o[1])) < 2:
            kd.append(f"build-own table: {o[0]!r} names fewer than two phrasings searched in the kit (separate them with ';')")
        if not v.startswith(("kit phase", "candidate", "game code")):
            kd.append(f"build-own table: {o[0]!r} has no verdict (the cell starts with kit phase, candidate or game code)")
        if v.startswith(("kit phase", "candidate")) and not kid and not asked:
            kd.append(f"build-own table: {o[0]!r} has no kit row id (K<n>) and does not say 'steward not asked'")
        if v.startswith("game code") and len(re.sub(r"steward not asked", "", last, flags=re.I).split()) < 6:
            kd.append(f"build-own table: {o[0]!r} is game code with no reason of six words or more")
        if v.startswith("kit phase") and kid and not any(re.match(rf"Phase GK{kid.group(1)}\b", t) for _, _, t in heads):
            kd.append(f"build-own table: {o[0]!r} is a kit phase on row K{kid.group(1)} but the plan has no 'Phase GK{kid.group(1)}' heading")
        if fitt and name not in fitt:
            kd.append(f"kit-fit review: no line for the build-own row {o[0]!r}")
        if v.startswith("candidate") and kit:
            for k in re.findall(r"\bK\d+\b", last):
                rf = kit / "docs" / "plan" / f"{k}.md"
                rt = rf.read_text(encoding="utf-8") if rf.is_file() else ""
                if not re.search(r"^state:\s*done\b", rt, re.M):
                    continue
                part = None
                with contextlib.suppress(Exception):
                    part = next((m["part"] for m in json.loads((kit / "docs" / "mechanics.json").read_text(encoding="utf-8"))["lines"] if m.get("row") == k and m.get("part")), None)
                body = rt.split("---", 2)[-1].strip()
                part = part or next(iter(re.findall(slug, body)), None) or (m.group(1) if (m := re.match(r"([a-z0-9]+(?:-[a-z0-9]+)+):", body)) else None)
                notes.add(f"WARN kit: build-own row {o[0]!r} names candidate {k}, which the kit closed (state: done): use " + (f"`{part}`" if part else f"the part {k}.md names"))
    rl = ru.split("\n")
    if answered and not any(re.match(r"[\s>*-]*Kit steward['’]s reply \(", l) and any(x.lstrip().startswith(">") for x in rl[i + 1:i + 4])
                            for i, l in enumerate(rl)):
        kd.append("the reuse map has no line starting \"Kit steward's reply (<date>)\" with the reply under it as a > block, though build-own rows carry answers")
    mh, mfence = None, False
    for l in ml:
        if l.strip().startswith(("```", "~~~")):
            mfence = not mfence
        c0 = [c.strip() for c in table_cells(l)] if l.strip().startswith("|") and not mfence else []
        if not c0:
            mh = None
        elif mh is None:
            mh = next((k for k, c in enumerate(c0) if "kit function" in c.lower()), -1)
        elif not re.fullmatch(r"[\s:-]*", c0[0]) and not c0[0].startswith("<") and not named(c0[mh] if 0 <= mh < len(c0) else l):
            kd.append(f"Modifier order: row {c0[0]!r} names no kit function (in backticks) and no build-own row")
    if "--kit-optional" in sys.argv:
        notes |= {f"kit: {d}" for d in kd}
    else:
        problems += [f"kit: {d}" for d in kd]

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
                at = opt("--tsc-at", "") if "--tsc-at" in sys.argv else ""
                if at and not Path(at).is_dir():
                    problems.append(f"--tsc-at: no folder {at}")
                    at = None
                with (contextlib.nullcontext(at) if at else tempfile.TemporaryDirectory()) as tmp:
                    f = Path(tmp) / f"plancheck-contract-{os.getpid()}.ts"
                    f.write_text(code, encoding="utf-8")
                    cfg = Path(tmp) / f"plancheck-tsconfig-{os.getpid()}.json"
                    try:
                        cfg.write_text(json.dumps({"compilerOptions": {"noEmit": True, "strict": True, "exactOptionalPropertyTypes": True,
                            "noUncheckedIndexedAccess": True, "noImplicitOverride": True, "target": "es2023", "lib": ["es2023", "dom", "dom.iterable"], "jsx": "react-jsx", "module": "esnext",
                            "moduleResolution": "bundler", "allowImportingTsExtensions": True, "skipLibCheck": True},
                            "files": [f.name]}), encoding="utf-8")  # a config of its own: TS 6 refuses command-line files beside a tsconfig.json
                        r = subprocess.run([tsc, "-p", cfg.name], cwd=tmp, capture_output=True, text=True, encoding="utf-8")
                    finally:
                        for x in (f, cfg):
                            x.unlink(missing_ok=True)
                    if r.returncode != 0:
                        problems.append("type contract does not compile:\n" + re.sub(r"\((\d+),(\d+)\): (error|warning) TS", r" line \1:\2 \3 TS", r.stdout + r.stderr)[:3000])  # no "file(1,2): error TS" form: CI's tsc matcher would annotate it as a build error

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
