// The SDK client and prompt caching, ported from STCC server/opponent/client.ts, config.ts and ledger.ts (a69c8dac).
export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  ephemeral_5m_input_tokens?: number;
  ephemeral_1h_input_tokens?: number;
}
export interface Ask {
  model: string;
  system: string[];
  prompt: string;
  maxTokens?: number;
  /** K741: sent as output_config.effort; thinking stays adaptive. */
  effort?: 'low' | 'medium' | 'high';
}
export interface Answer {
  option: number;
  /** K741: a multi-select answer (item numbers). */
  picks?: number[];
  /** K741: a split answer (points per target, in order). */
  points?: number[];
  reason: string;
  usage: Usage;
  stop_reason?: string | null;
}
export type Chooser = (ask: Ask) => Promise<Answer>;

/** Dollars per million tokens (from the pricing page; the cache-read multiplier differs per model). `over`: the price of a request whose prompt (input + cache writes + cache reads) exceeds `at` tokens. */
export interface Price {
  input: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
  cacheRead: number;
  output: number;
  over?: { at: number; price: Price };
}
export const PRICES: Record<string, Price> = {
  'claude-opus-5-5': { input: 4, cacheWrite5m: 5, cacheWrite1h: 8, cacheRead: 0.2, output: 20 },
  'claude-sonnet-5-5': { input: 2, cacheWrite5m: 2.5, cacheWrite1h: 4, cacheRead: 0.1, output: 10 },
  'claude-haiku-5-5': {
    input: 0.1, cacheWrite5m: 0.125, cacheWrite1h: 0.2, cacheRead: 0.01, output: 0.5,
    over: { at: 100_000, price: { input: 0.5, cacheWrite5m: 0.625, cacheWrite1h: 1, cacheRead: 0.05, output: 2.5 } },
  },
};
export const MAX_TOKENS = 8000;

export function cost(usage: Usage, model: string): number {
  let p = PRICES[model];
  if (p === undefined) throw new Error(`No price for model ${model}`);
  if (p.over && usage.input_tokens + usage.cache_creation_input_tokens + usage.cache_read_input_tokens > p.over.at) p = p.over.price;
  const short = usage.ephemeral_5m_input_tokens ?? 0;
  const long = usage.ephemeral_1h_input_tokens ?? 0;
  const unsplit = Math.max(0, usage.cache_creation_input_tokens - short - long);
  return (
    (usage.input_tokens * p.input +
      (short + unsplit) * p.cacheWrite5m +
      long * p.cacheWrite1h +
      usage.cache_read_input_tokens * p.cacheRead +
      usage.output_tokens * p.output) /
    1_000_000
  );
}

/** A ceiling for the next call before it is made: every prompt token at the cache-write price plus a full answer. */
export function worstCost(ask: Ask, maxTokens = MAX_TOKENS): number {
  let p = PRICES[ask.model];
  if (p === undefined) throw new Error(`No price for model ${ask.model}`);
  const chars = ask.system.reduce((n, s) => n + s.length, 0) + ask.prompt.length + 1000;
  if (p.over && chars / 3 > p.over.at) p = p.over.price;
  return ((chars / 3) * p.cacheWrite5m + maxTokens * p.output) / 1_000_000;
}

const TOOL = {
  name: 'choose',
  description: 'Pick one of the numbered options.',
  input_schema: {
    type: 'object' as const,
    properties: {
      option: { type: 'integer', description: 'The number of the chosen option, when the question asks for one option.' },
      picks: { type: 'array', items: { type: 'integer' }, description: 'When the question asks to pick several: the numbers of all picked items.' },
      points: { type: 'array', items: { type: 'integer' }, description: 'When the question asks to allocate points: one number per target, in the listed order.' },
      reason: {
        type: 'string',
        description: 'Why, in one sentence of at most 20 words; start with BUG: when the rules, the view or the options look wrong.',
      },
    },
    required: ['reason'],
  },
};

// The SDK is loaded only when a paid chooser is built, so --dummy and tests never need it. The key is passed
// explicitly and the SDK's environment fallbacks are cut (authToken null, fixed base URL, no custom headers).
export async function sdkChooser(apiKey: string, maxTokens = MAX_TOKENS): Promise<Chooser> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const headers = process.env['ANTHROPIC_CUSTOM_HEADERS'];
  delete process.env['ANTHROPIC_CUSTOM_HEADERS'];
  let client: InstanceType<typeof Anthropic>;
  try {
    client = new Anthropic({
      apiKey,
      authToken: null,
      baseURL: 'https://api.anthropic.com',
      maxRetries: 2,
      timeout: 120_000,
      defaultHeaders: {},
    });
  } finally {
    if (headers !== undefined) process.env['ANTHROPIC_CUSTOM_HEADERS'] = headers;
  }
  return makeChooser(client as unknown as Messages, maxTokens);
}

export interface Body {
  tool_choice: { type: string };
  messages: { role: string; content: string }[];
  [k: string]: unknown;
}
export interface Reply {
  content: { type: string; input?: unknown }[];
  stop_reason?: string | null;
  usage: { input_tokens: number; output_tokens: number; cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null; cache_creation?: { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number } | null };
}
export interface Messages {
  messages: { create(body: Body): Promise<Reply> };
}
// tool_choice is always auto: forced tool use (type tool or any) is refused by models that think.
export function makeChooser(client: Messages, maxTokens = MAX_TOKENS): Chooser {
  return async (ask) => {
    const last = ask.system.length - 1;
    const result = await client.messages.create({
      model: ask.model,
      max_tokens: ask.maxTokens ?? maxTokens,
      system: ask.system.map((text, i) =>
        i === last
          ? { type: 'text' as const, text, cache_control: { type: 'ephemeral' as const } }
          : { type: 'text' as const, text },
      ),
      tools: [TOOL],
      tool_choice: { type: 'auto' },
      ...(ask.effort === undefined ? {} : { output_config: { effort: ask.effort } }),
      messages: [{ role: 'user', content: ask.prompt }],
    });
    const use = result.content.find((b) => b.type === 'tool_use');
    const input = (use?.input ?? {}) as { option?: unknown; reason?: unknown; picks?: unknown; points?: unknown };
    return {
      option: typeof input.option === 'number' ? input.option : Number.NaN,
      ...(Array.isArray(input.picks) ? { picks: input.picks as number[] } : {}),
      ...(Array.isArray(input.points) ? { points: input.points as number[] } : {}),
      reason: typeof input.reason === 'string' ? input.reason : '',
      stop_reason: result.stop_reason ?? null,
      usage: {
        input_tokens: result.usage.input_tokens,
        output_tokens: result.usage.output_tokens,
        cache_creation_input_tokens: result.usage.cache_creation_input_tokens ?? 0,
        cache_read_input_tokens: result.usage.cache_read_input_tokens ?? 0,
        ephemeral_5m_input_tokens: result.usage.cache_creation?.ephemeral_5m_input_tokens ?? 0,
        ephemeral_1h_input_tokens: result.usage.cache_creation?.ephemeral_1h_input_tokens ?? 0,
      },
    };
  };
}
