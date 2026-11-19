export { claimEngineCore } from './single.ts';
export { canonicalJson, fnv1a64 } from './canonical.ts';
export { copyJson, copyState, deepFreeze, freezeState, isFreezing, setStateFreezing } from './copy.ts';
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
} from './apply.ts';
export { adopt, closeDraft, copyList, copyMode, openDraft, own, setCopyMode, setCowChecks } from './cow.ts';
export type { Draft } from './draft.ts';
export { ctxEvents, draftOf, LOG_CAP, makeCtx, readCtx, setRngOverrides } from './ctx.ts';
export { cardInstanceId, parseCardInstanceId, seatKey, takePromptSeq, takeSeq } from './ids.ts';
export { GameOver } from './gameOver.ts';
export { hashState, replay, type ReplayExpectation, type ReplayResult } from './replay.ts';
export { MAX_TASKS_PER_ACTION, run } from './runner.ts';
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
} from './save.ts';
export type * from './types.ts';
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
} from './undo.ts';
export { EngineBugError, GameSetupError, IllegalActionError, notYet } from './errors.ts';
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
} from './steps.ts';
export { hashValue } from './hash.ts';
export { drawRandom, drawRandomIndex, nextUint32, randomInt, seedRng, shuffleInPlace, type RngState } from './rng.ts';
export { freshWords } from './fresh.ts';
export { clearLastKnown, clearLeft, hasLeft, isCurrent, lastKnown, lastKnownIn, leaveZone, newObjectTrack, refOf, type LastKnown, type ObjectRef, type ObjectTrack, type Tracked } from './objref.ts';
export { causeProblems, currentCause, effectCause, inCause, ruleCause, type Cause, type CauseCheck } from './cause.ts';
export { askOrTake, bar, blocked, legalIn, legalTable, onlyOne, type Blocked, type LegalTable, type OnlyOneNotice } from './legal.ts';
export { preview, type Preview, type PreviewOptions, type PreviewStop } from './preview.ts';
export { query } from './query.ts';
export { markIdle } from './idle.ts';
export { kernelPort, portAnswer, portOptions, portResult, portSettle, type EnginePort, type PortAnswer, type PortOption, type PortPrompt, type PortStep, type PortTypes } from './port.ts';
export { addPortStep, canUndoPortStep, extendPortStep, newPortSteps, portStepReason, redoPortStep, replayPortSteps, undoPortStep, type PortStepEntry, type PortStepHistory, type PortStepOptions, type PortStepResult, type ReplayedPortSteps } from './portSteps.ts';
