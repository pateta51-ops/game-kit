export { claimEngineCore } from './single';
export { canonicalJson, fnv1a64 } from './canonical';
export { copyJson, copyState, deepFreeze, freezeState, isFreezing, setStateFreezing } from './copy';
export {
  advance,
  applyAction,
  applyActionWith,
  createGame,
  isChecking,
  isRevealing,
  setInvariantChecking,
  validateAction,
  type ValidationResult,
} from './apply';
export { adopt, closeDraft, copyList, copyMode, openDraft, own, setCopyMode, setCowChecks } from './cow';
export type { Draft } from './draft';
export { ctxEvents, draftOf, LOG_CAP, makeCtx, readCtx, setRngOverrides } from './ctx';
export { cardInstanceId, parseCardInstanceId, takePromptSeq, takeSeq } from './ids';
export { GameOver } from './gameOver';
export { hashState, replay, type ReplayExpectation, type ReplayResult } from './replay';
export { MAX_TASKS_PER_ACTION, run } from './runner';
export {
  createSave,
  DAMAGED,
  DEFAULT_SAVE_FORMAT,
  exportSave,
  importSave,
  migrateSave,
  OLDER_BUILD,
  restoreSave,
  sealOf,
  UNKNOWN_COMMIT,
  type CreateSaveInput,
  type MigrateResult,
  type RawSave,
  type RestoreResult,
  type SaveFile,
  type SaveFormat,
} from './save';
export type * from './types';
export {
  canUndo,
  newHistory,
  appendAction,
  recordAction,
  redo,
  revealReason,
  randomReason,
  SOMETHING_REVEALED,
  stateAt,
  undo,
  type History,
  type HistoryResult,
  type UndoMode,
} from './undo';
export { EngineBugError, GameSetupError, IllegalActionError, notYet } from './errors';
export {
  addStep,
  canUndoStep,
  CHECKPOINT_EVERY,
  extendStep,
  KEEP_STEPS,
  newSteps,
  redoStep,
  replaySteps,
  undoStep,
  type ReplayedSteps,
  type Step,
  type StepHistory,
  type StepOptions,
  type StepResult,
  type UndoStepOptions,
} from './steps';
export { differentialApply, type DifferentialResult } from './cowcheck';
export { hashValue } from './hash';
export { drawRandom, drawRandomIndex, nextUint32, randomInt, seedRng, shuffleInPlace, type RngState } from './rng';
export { freshWords } from './fresh';
export { clearLastKnown, clearLeft, hasLeft, isCurrent, lastKnown, lastKnownIn, leaveZone, newObjectTrack, refOf, type LastKnown, type ObjectRef, type ObjectTrack, type Tracked } from './objref';
export { doesNothing, idleProblems, markIdle } from './idle';
export { enumerateAnswers, expectEvents, firstPicks, outcomePicks, playUntil, randomPicks, skipEmptyProblems, type Played } from './answers';
export { causeProblems, currentCause, effectCause, inCause, ruleCause, type Cause, type CauseCheck } from './cause';
export { askOrTake, bar, blocked, legalIn, legalTable, onlyOne, type Blocked, type LegalTable, type OnlyOneNotice } from './legal';
export { preview, type Preview, type PreviewOptions, type PreviewStop } from './preview';
export { applyDebug, debugVerbs, KERNEL_VERBS } from './debug';
export { batchGroups, batchOf, cancelBatch, changeOccurrence, DEFAULT_ORDER, ignoreBatch, inBatch, insteadOf, occurrenceOf, PASS, prevent, preventionWindow, sharedKeys, takeSettled, timingHandlers, would, type Batch, type Occurrence, type OccurrenceInput, type OccurrenceKeys, type Prevention, type PreventionOffer, type PreventionWindow, type SharedKey, type TimingConfig, type TimingPromptInfo, type TimingState, type TimingTask, type Window, type WindowTiming } from './timing';
export { replacementCandidates, type Replacement, type ReplaceResult } from './replace';
export { addEffect, allEffects, anyEffect, batchOver, bindEffect, boundary, effectsOf, expireEffects, layered, removeEffect, sourceLeft, stampActive, sumEffects, spendEffect, type Boundary, type ContinuousEffect, type Duration, type EffectInput, type EffectsConfig, type LayerConfig } from './durations';
export { checkpointHandlers, RECOMPUTE_CAP, recompute, type CheckpointConfig, type StateCheck } from './checkpoint';
export { collectTriggers, DEFAULT_PRIORITY, enteredPlay, pendingTriggers, simultaneously, TRIGGER_CAP, triggerHandlers, type PendingTrigger, type TriggerCandidate, type TriggerOrder, type TriggerPromptInfo } from './triggers';
export { query } from './query';
