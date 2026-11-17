# 1.1 effects, 1.2 sound, 1.3 voice

Release ladder (owner): 1.0 no animation or sound; 1.1 VFX; 1.2 SFX and music; 1.3 voice. The director owns the specs; the kit plays them. Never add motion or sound to 1.0.

## 1.1 effects
Components: [`motion-frame`](../../components/motion-frame/README.md) plays the director's JSON beats; [`effect-library`](../../components/effect-library/README.md) holds the twelve verbs (`move`, `lift`, `settle`, `fade-in`, `fade-out`, `show`, `hide`, `flip`, `scale`, `shake`, `glow`, `text`) and canvas effects.
1. `createVerbs()`, `registerEffects(verbs, { resolve })` returns the layer; `createMotionPlayer({ specs, stages, verbs, speed, context: layer, onBeatEnd })`.
2. `stageFromLayout` builds stages from the screen layout JSON; `validateSpecs` in the game's check.
3. `speed` honours reduced motion (`withReducedMotion`) and automation (`withAutomationOff`). `paced-view` shows an answer's events one step at a time.
4. `board-registry` `movements` gives piece moves between two registries.
5. `token-flights`: tokens (coins, damage, discs) that moved between two views fly there; a ledger draws each in one place at a time.
6. `target-arrow`: the curved arrow from the asking card to the pointer that snaps to a target, collapses into it and hits; `strikes.hold` makes token-flights wait for the hit.

6. `token-bag`: a bag with its count; the draw is a 2D flight from `[data-bag]` or a 3D shake-and-draw (three.js loaded lazily, falls back to 2D); the engine has drawn already.

## 1.2 sound
[`sound-player`](../../components/sound-player/README.md): one `SoundTable` of cues, tiers, music states, ambience. A cue is never cut (fades 150 ms). `createEventSounds` maps engine events to cues. The `check` lists missing files and over-size cues. Assets are made with [`audio-gen`](../../components/audio-gen/README.md) (free local models in WSL; paid voices only for EBR).

## 1.3 voice
[`voice`](../../components/voice/README.md): `VoiceTable` lines (`once`, `every`, `busy`), `voiceCues(table)` spread into the sound table, `createVoice({ table, player })`. Never-twice is keyed by the spoken text.

Proof: spec validation in the check, e2e with `finishAnimations` / `motionsDone` from `e2e-helpers`, sound `check` in the chain.
