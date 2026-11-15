// Node only (reads the disk): import it from a game's check script, never from the app.
import { checkSoundFiles, type SoundCheckOptions } from '../sound-player/check';
import { voiceCues, type VoiceTable } from './voice';

/** Lines of problems: the sound player's file check on every file of the line table, plus lines with no file. `missing` names are file paths. */
export function checkVoiceFiles(t: VoiceTable, dir: string, o: SoundCheckOptions = {}): string[] {
  const bad = checkSoundFiles({ cues: voiceCues(t) }, dir, { ...o, missing: (o.missing ?? []).map((f) => `voice:${f}`) });
  for (const [id, l] of Object.entries(t.lines)) if (l.files.length === 0) bad.push(`line ${id}: no files`);
  return bad.map((b) => b.replace(/^voice:/, ''));
}
