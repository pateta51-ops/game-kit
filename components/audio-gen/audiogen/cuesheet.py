"""A cue sheet (a Markdown table) to one written prompt spec per cue, never shortened.

Columns are found by content, so a row with a missing cell still reads: cue, beats, on-screen, object (the first four
cells), then attack/body/tail cells, a length (`90 ms`, `0.8 s`), a tier (a category name), the variations, the nots.
Wording comes from the config's `prompt` block; nothing here knows a game."""
from __future__ import annotations

import json
import re

LEN = re.compile(r"^\s*(\d+(?:\.\d+)?)\s*(ms|s)\b", re.I)
DEFAULT_PROMPT = {
    "style": "Close microphone, dry, no reverb.",
    "tail": "no music, no voice.",
    "negativePrompt": "music, voice, speech, synth, beep, reverb, noise",
    "skip": [],
    "overrides": {},  # cue name -> a hand-written prompt that replaces the built one
}


def cells(line: str) -> list[str]:
    return [c.strip() for c in line.strip().strip("|").split("|")]


def parse_sheet(md: str, header: str = "Cue", tiers: tuple[str, ...] = ("quiet", "normal", "loud")) -> list[dict]:
    """The rows of the first table whose header starts with `header`. A row with no readable length or tier is
    returned with that field None (to_specs reports it)."""
    rows, on = [], False
    for line in md.splitlines():
        if not line.lstrip().startswith("|"):
            if on and rows:
                break
            continue
        c = cells(line)
        if c and c[0] == header:
            on = True
            continue
        if not on or set(line.replace("|", "").strip()) <= set("-: "):
            continue
        rows.append(parse_row(c, tiers))
    return rows


def parse_row(c: list[str], tiers: tuple[str, ...] = ("quiet", "normal", "loud")) -> dict:
    ti = next((i for i, v in enumerate(c) if i >= 4 and v.lower() in tiers), None)
    li = next((i for i in range((ti if ti is not None else len(c)) - 1, 3, -1) if LEN.match(c[i])), None)
    length = None
    if li is not None:
        m = LEN.match(c[li])
        assert m
        length = float(m.group(1)) / (1000 if m.group(2).lower() == "ms" else 1)
    attack = ", ".join(v for v in c[4:li if li is not None else 4] if v)
    var = None
    if ti is not None and ti + 1 < len(c):
        m = re.match(r"\d+", c[ti + 1])
        var = int(m.group(0)) if m else None
    return {"name": c[0], "beats": c[1] if len(c) > 1 else "", "onScreen": c[2] if len(c) > 2 else "",
            "object": c[3] if len(c) > 3 else "", "attack": attack, "length": length,
            "tier": c[ti].lower() if ti is not None else None, "variations": var,
            "not": c[ti + 2] if ti is not None and ti + 2 < len(c) else ""}


def seconds_text(s: float) -> str:
    return f"{s:.3f}".rstrip("0").rstrip(".")


def prompt_for(row: dict, p: dict | None = None) -> str:
    """Object, then the attack-body-tail clause, the room, the nots, the length."""
    q = {**DEFAULT_PROMPT, **(p or {})}
    obj = row["object"].strip()
    obj = obj[:1].upper() + obj[1:]
    parts = [x.strip() for x in row["attack"].split(",") if x.strip()]
    clause = ""
    if parts:
        parts = [("then nothing" if x.lower() == "none" else x) for x in parts]
        if parts[-1] != "then nothing":
            parts.append("then nothing")
        clause = ": " + ", ".join(parts)
    nots = row["not"].strip().rstrip(".")
    room = ", ".join(x for x in (q["style"].strip().rstrip("."), nots, q["tail"].strip().rstrip(".")) if x) + "."
    return f"{obj}{clause}. {room} {seconds_text(row['length'])} seconds."


def to_specs(rows: list[dict], p: dict | None = None, default_var: int = 1) -> tuple[list[dict], list[str]]:
    """The cue specs (audiogen's cues.json shape) and the problems found (a row with no length or no tier)."""
    q = {**DEFAULT_PROMPT, **(p or {})}
    out, bad = [], []
    for r in rows:
        if r["name"] in q["skip"]:
            continue
        if r["length"] is None or r["tier"] is None:
            bad.append(f"{r['name']}: no {'length' if r['length'] is None else 'tier'} found")
            continue
        out.append({"name": r["name"], "category": r["tier"], "length": round(r["length"], 4),
                    "variations": r["variations"] or default_var, "prompt": q["overrides"].get(r["name"]) or prompt_for(r, q),
                    "negativePrompt": q["negativePrompt"], "notes": (r["beats"] + " | " + r["onScreen"]).strip(" |")})
    return out, bad


def dump(specs: list[dict]) -> str:
    return json.dumps({"cues": specs}, indent=1, ensure_ascii=False) + "\n"
