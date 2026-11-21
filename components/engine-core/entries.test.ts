import { expect, it } from 'vitest';
import * as index from './index.ts';
import * as kernel from './kernel.ts';
import * as timed from './timed.ts';
import * as tools from './tools.ts';

it('K278: index exports exactly the union of kernel, timed and tools, with no name in two entries', () => {
  const parts = [kernel, timed, tools].map((m) => Object.keys(m));
  const union = parts.flat();
  expect(new Set(union).size).toBe(union.length);
  expect(Object.keys(index).sort()).toEqual(union.sort());
  expect(union.length).toBe(176);
});

// K278: tsc fails if index stops exporting a type an entry has
export type { AnswerAction, ApplyResult, Batch, Blocked, Boundary, Cause, CauseCheck, CheckpointConfig, ContinuousEffect, CreateSaveInput, Ctx, CtxRng, DebugAction, DebugHandler, DifferentialResult, Draft, Duration, EffectInput, EffectsConfig, EventInput, ForcedRoll, GameRules, GameTypes, HandlerTable, History, HistoryResult, InvariantViolation, KernelEvent, KernelOption, KernelPrompt, KernelState, KernelTask, LastKnown, LayerConfig, LegalTable, MigrateResult, ObjectRef, ObjectTrack, Occurrence, OccurrenceInput, OccurrenceKeys, OnlyOneNotice, PendingTrigger, Played, Prevention, PreventionOffer, PreventionWindow, Preview, PreviewOptions, PreviewStop, RawSave, ReplaceResult, Replacement, ReplayExpectation, ReplayResult, ReplayedSteps, RestoreResult, RngState, RngWords, SaveFile, SaveFormat, SharedKey, StateCheck, Step, StepHistory, StepOptions, StepResult, TaskHandler, TimingConfig, TimingPromptInfo, TimingState, TimingTask, Tracked, TriggerCandidate, TriggerOrder, TriggerPromptInfo, UndoMode, UndoStepOptions, ValidationResult, Window, WindowTiming } from './index.ts';
