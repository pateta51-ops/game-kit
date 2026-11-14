# E2: sound, voice, replay (read-only; scores 0-3)

## 1. Sound player
| | warps src/ui/audio | unst src/ui/sound |
|---|---|---|
| Generic | 2: only catalog.ts (cue name -> sound id, priority, bus, duck, weights) is game data; engine/mixer/playlist are neutral. But imports ../fx/cue (CueName), ../game/store (settings) and public/audio/manifest.json | 1: cues.ts maps this game's GameEvents (cardDrawn, bossHit, locationDown...) and imports ../../engine; recipes.ts has the game's 16 sounds; SoundSettings imports the game's Settings screen, store, localData |
| Tested | 3: 3 test files (audio.test 496 lines on a fake context, playlist, stun cue) + e2e audio.spec, audio-envelope.spec | 3: 7 test files, one per source file, plus e2e sound.spec |
| Proven | 3: owner set levels by ear on review page (6 Nov); A4/A5 owner rulings in catalog comments; many fix commits | 2: owner part 5 (D-109), PR #42 review fix, e2e |
| Fixes | 3: unlock on every gesture until running (iOS), resume after interruption, voice and gain leaks, music decode retry rules, music ducking | 2: same iOS "interrupted" resume, peak limiter, spacing of cues, glide on volume change |
| Complete | music loops + playlist/style, ducking, priority mixer (admit by priority), no-repeat variation pick with weights, buses sfx/ui, fake context for tests. Lacks: browser synthesis | synthesised sounds (no files, zero asset cost), event-to-cue merge with count and cap of 3 per action, lag drop, volume preview, settings panel. Lacks: music, priorities, buses |
| Seams | 3: data table + manifest; engine pure over a fake context | 2: cues.ts is code over events; recipes are code. Pure parts (cues, levelOf) testable |

Verdict
- Base: warps. Reason: data-driven catalog, music, priorities and ducking, and the most fixes with owner sign-off.
- Graft from unst: the event-to-cue merge/cap/lag logic (as an optional layer, game supplies cueOf), the browser-synth recipes idea as a no-files fallback, its SoundSettings panel shape.
- Cut/parameterise: CueName type, the game store import (settings should be passed in), manifest path, the game's catalog entries (stun-buzz weights, warhammer-slam etc).
- Lift effort: M. One batch to inject settings and cue type.
- Risks: none found; no third-party code seen.

## 1b. Sound generator
Only warps has one (scripts/audio/audiogen.py + audiogen/ package: backends, manifest, post, spec, cli; workers for acestep and stable-audio-open; python test file; docs/audio/*). unst has none (synthesises in browser), so no rival.
- Generic 3 (commit "A2: game-agnostic audio pipeline", spec-driven), Tested 2 (one test_audiogen.py), Proven 3 (shipped sounds, elevenlabs-music backend added with tests, setup-keys doc), Seams 3 (spec + backend plug-ins).
- Base: warps. Lift S-M. Risks: set-key.sh and setup-keys.md handle API keys; I did not open them for secrets (checked only ebr). Worker models (ACE-Step, Stable Audio Open) have their own licences: check before kit.

## 2. Voice-over (ebr only)
Scores (single candidate): Generic 2, Tested 1, Proven 3, Fixes n/a, Complete 3, Seams 2.
- Generic: the player src/ui/prompts/voice.ts (148 lines) imports only zustand, no game words: easy to lift. Scripts import ../src/content/speech (quote spans, NARRATOR, paragraph keys), castingRound1, castElevenLabs, voicesE24 and entryFiles: game text format and cast of this game; "ranger/path/card" words appear 16 times in voice-over.ts, 9 in voice-casting.ts. The generic parts: lib/elevenlabs.ts (API client with billing guard), lib/voiceEnv.ts (loads ELEVENLABS_API_KEY and HF_TOKEN from a key file, prints names never values), voice-setup.ps1, voice-over.py (Kokoro GPU fill-in).
- Tested: 2 test files, 11 cases (billing guard, real-data), none on the player or Kokoro path.
- Proven: decision D-UD01, 2026-11-08 owner decision (audio in git), handoff 2026-11-09, PRs #90, #221, #224, #225 (reveal, autoplay, Skip). Cost-budgeted runs.
- Secrets: none found. grep for sk_ keys and literal key assignments hit only the 'xi-api-key' header name in elevenlabs.ts:130; keys come from env/key file.
- Base: ebr. Graft: nothing. Cut: speech.ts coupling, cast tables, entry-file walker, guide-book UI. Parameterise: a "text source -> segments with speaker" interface.
- Lift effort: M (player S; pipeline needs the text-source interface and a cast config file).
- Risks: ElevenLabs/Kokoro licences and cost; paid voices must not be rehashed into public repos; audio in git size (50 MB GitHub cap); hash-keyed cache (hash53 of text) means text edits re-bill.

## 3a. Replay viewer (rome only)
Scores: Generic 1, Tested 0-1 (no direct test files found in the export), Proven 2, Fixes n/a, Complete 3, Seams 1.
- Generic: replayStage.ts (802 lines) imports game art (artUrl, colorIcon, enemyArt from table/cells), the content store, GameScreen, MOTIONS catalog and game engine; replays.ts reads docs/ui/motion/replays.json and rebuilds states from createGame plus legal answers. ReplayLab renders the real GameScreen. It is an approval-recording stage for this game's animations (B19), not a generic viewer.
- Proven: one commit, "B19: animations (#35)", 10 Nov.
- Verdict: pattern only. The idea (re-derive every view from seed plus actions, sample frames per step with before/after views and captions) is reusable; the code is welded to Rome's screens and art.
- Lift effort: L as code; S as a pattern. Risk: the motion code descends from the BSD-3 LOTR LCG project (notice must travel).

## 3b. Command-line replay
| | Generic | Tested | Proven | Fixes | Complete | Seams |
|---|---|---|---|---|---|---|
| stcc (128 lines) | 2 | 2 (tests/scripts + engine + scenarios + e2e replay.spec) | 3 (fixtures re-recorded decision 8 Nov) | 1 | save file, --pack, exit codes 0/1/2, final-hash check | 2 (injected Io) |
| imp (211) | 2 | 3 (10 cases + golden/replays.test) | 3 | 3 | + --update-golden, golden games, legacy content hash | 2 |
| unst (201) | 2 | 2 (5 cases + engine test) | 2 | 2 | + --update-golden, bot-played games | 2 |
| warps (73) | 1 | 2 (kernel/replay.test) | 1 | 1 | save parse only, no options | 1 |
| ebr (265) | 2 | 1 (4 cases) | 2 | 2 | different tool: records games on a base checkout and replays on head, comparing state and event hashes after every action (regression diff), with --quick | 1 (dynamic import of src files) |
- All five call a shared engine replay() in src/engine/replay/replay.ts (same file in stcc, imp, unst, warps, rome, jarl); the CLI is a thin wrapper, so the kit value is the engine function plus a wrapper.
- Base: imp (most tests, golden update flow, content-hash handling). Graft: ebr's per-action hash comparison between two checkouts (finds the first diverging action), stcc's clean exit-code contract and Io injection (imp has the same).
- Cut: pack names (PACKS), defaultSeats, GOLDEN_GAMES, sim/packs loader. Parameterise: content loader and engine import.
- Lift effort: M. Risks: determinism critical (state hash, RNG seed, content hash blanking); golden files must be re-recorded only on deliberate rule change.

## Not checked
Contents of warps set-key.sh and setup-keys.md; rome replay tests (none found by name; e2e not grepped); same-file diffs of the engine replay.ts copies; ebr castElevenLabs.ts contents.
