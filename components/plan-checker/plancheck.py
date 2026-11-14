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
  cell and a "Confidence" cell holding a percentage;
- with --tsc: the ```ts blocks of the type-definitions section compile under strict flags (needs `tsc` on PATH or in
  ./node_modules/.bin).

Sections are found by heading keywords (case-insensitive); override them if your plan names them differently:
  --scenarios "Scenario catalogue"  --phases "Implementation phases"  --types "Type definitions"
  --sessions "Session plan"

Usage: python plancheck.py docs/BUILD_PLAN.md [--tsc] [--scenarios TEXT] [--phases TEXT] [--types TEXT]
       [--sessions TEXT]
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


def main() -> int:
    safe_console()
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    for flag in ("--scenarios", "--phases", "--types", "--sessions"):
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
    problems: list[str] = []

    # --- code fences ---
    if sum(1 for l in lines if l.strip().startswith("```")) % 2:
        problems.append("unbalanced code fences")

    # --- anchors and § references ---
    anchors = {anchor(h) for _, _, h in heads}
    for t in re.findall(r"\]\(#([^)]+)\)", src):
        if t not in anchors:
            problems.append(f"broken anchor #{t}")
    numbered = {m.group(1) for _, _, h in heads if (m := re.match(r"^(\d+(?:\.\d+)*)", h))}
    for r in sorted({r for r in re.findall(r"§(\d+(?:\.\d+)*)", src) if r not in numbered}):
        problems.append(f"unresolved §{r}")

    # --- tables; collect first-cell definitions ---
    first_cell_defs: list[str] = []
    scen_sec = section(lines, heads, opt("--scenarios", "Scenario catalogue"))
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

    # --- the type contract ---
    if "--tsc" in sys.argv:
        types = section(lines, heads, opt("--types", "Type definitions"))
        code = "\n".join(re.findall(r"```ts\n(.*?)```", types, re.S))
        if not code:
            problems.append("--tsc: no ```ts blocks found in the type-definitions section")
        else:
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

    print(f"{path}: {len(lines)} lines, {len(defined)} defined IDs, {len(scenarios)} scenarios")
    for p in problems:
        print("PROBLEM", p)
    print("OK" if not problems else f"{len(problems)} problem(s)")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
