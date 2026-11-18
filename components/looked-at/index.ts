export type Peek = Readonly<{ cardId: string; zone: string; when: number }>;
export type LookedAtMemory = readonly Peek[];

export function recordPeek(memory: LookedAtMemory, peek: Peek): LookedAtMemory {
  return [...forgetCard(memory, peek.cardId), { ...peek }];
}

export function forgetCard(
  memory: LookedAtMemory,
  cardId: string,
): LookedAtMemory {
  return memory.filter((peek) => peek.cardId !== cardId);
}

export function knownInZone(
  memory: LookedAtMemory,
  zone: string,
): LookedAtMemory {
  return memory.filter((peek) => peek.zone === zone);
}
