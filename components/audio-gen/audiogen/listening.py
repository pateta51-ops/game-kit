"""The listening page's data file: one entry per cue with its takes, each take with its file, its exact prompt and its
manifest facts, in the shape the game-sfx-review skill's page shows: {"snd": [...], "mus": [...], "voi": [...]}, each
entry {cue, name, when, takes: [{id, model, file, prompt, now, manifest}]}."""
from __future__ import annotations

import json
from pathlib import Path


def build(manifest: dict, cues: list[dict] | None = None, voice_stats: dict | None = None, voice_table: dict | None = None,
          now: set[str] | None = None) -> dict:
    """`cues` are the cue specs (their `notes` fill `when`); `now` is the set of take ids in the game today."""
    by = {c["name"]: c for c in cues or []}
    snd: dict[str, dict] = {}
    mus: dict[str, dict] = {}
    for r in manifest.get("files", []):
        side = mus if r.get("kind") == "music" else snd
        c = by.get(r["id"], {})
        e = side.setdefault(r["id"], {"cue": r["id"], "name": r["id"], "when": c.get("notes", ""), "takes": []})
        tid = f"{r['id']}-{r['variation']}"
        e["takes"].append({"id": tid, "model": r.get("model", ""), "file": r["file"], "prompt": r.get("prompt", ""),
                           "now": tid in (now or set()),
                           "manifest": {k: r[k] for k in ("seed", "durationMs", "loudness", "backend", "licence", "date", "bpm", "bars", "loop") if k in r}})
    voi: dict[str, dict] = {}
    texts = {ln["id"]: ln for ln in (voice_table or {}).get("lines", [])}
    for k, s in (voice_stats or {}).items():
        e = voi.setdefault(s["id"], {"cue": s["id"], "name": s.get("text", s["id"]), "when": texts.get(s["id"], {}).get("when", ""), "takes": []})
        e["takes"].append({"id": k, "model": f"Kokoro ({s['voice']})", "file": s["file"],
                           "prompt": f"Kokoro-82M, voice {s['voice']}, speed {s['speed']}, words: \"{s['text']}\"",
                           "now": k in (now or set()),
                           "manifest": {"seconds": s["seconds"], "lufs": s["lufs"], "truePeak": s["truePeak"], "rule": s["rule"]}})
    return {"snd": list(snd.values()), "mus": list(mus.values()), "voi": list(voi.values())}


def write(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
