// kie.ai abstraction layer. Confirmed by direct testing that kie.ai serves different model
// families from different endpoints with different wire formats — there's no single
// unified API:
//   - Claude models: https://api.kie.ai/claude/v1/messages, mirrors Anthropic's native
//     Messages API (system as a top-level field, tool_use/tool_result content blocks).
//   - Everything else (Gemini, GPT, ...): https://api.kie.ai/{model}/v1/chat/completions,
//     standard OpenAI chat-completions shape (tools array, tool_calls, role:"tool").
// The family (and therefore the endpoint/wire format) is inferred from the model's name,
// so callers never need to know which shape is in play.
//
// One model is not enough in practice. kie.ai's Gemini upstream intermittently answers
// with an account-level "Prohibited Use Policy" refusal — HTTP 200, normal completion
// shape, the refusal text sitting where the answer should be (15 Sep 2026: it rendered
// verbatim on the home page's morning-brief card). So every call walks MODEL_CHAIN in
// order, and the next model is always a DIFFERENT vendor: a refusal is a property of that
// vendor's policy layer, so retrying the same one is futile.
export class AIError extends Error {}

/**
 * A response another vendor could plausibly answer: a refusal dressed up as a completion,
 * or an empty one. Its own class so the fallback fires on a decision, not on a guess.
 */
export class AIBlockedError extends AIError {}

// The models to try, lead first. Deliberately a code constant rather than an env var —
// same reasoning as LONG_ONLY: the order is an evidence-driven decision (Gemini's PUP
// block put a refusal on the home page on 15 Sep, and GPT 5.2 wrote the better brief
// head-to-head on the same prompt), so it belongs in the git history, not in a dashboard
// setting that can't be read back. gpt-5-2 is also the only GPT chat model kie.ai serves
// on this key — gpt-5-5, gpt-5-6-* and gpt-6-astra all answer "the model is not
// supported" — and it costs within pennies of Gemini: $0.44/M in, $3.50/M out.
// KIE_MODEL_CHAIN (comma-separated) overrides the whole list for a quick experiment.
const MODEL_CHAIN = ["gpt-5-2", "gemini-3.1-pro"];

const PROVIDER_BLOCK_PATTERNS = [
  /prohibited use policy/i,
  /\bPUP violations?\b/i,
  /request is blocked/i,
  /ai\.google\.dev\/gemini-api/i,
  /blocked by (the )?safety/i,
];

/** True when a 200 carries a provider refusal instead of an answer. */
export function isProviderBlockText(text: string): boolean {
  return PROVIDER_BLOCK_PATTERNS.some((p) => p.test(text));
}

// GPT leaks a web-search citation marker into the prose every handful of calls: private-use
// wrapper characters around "cite" + "turn0search10", which renders as mojibake
// mid-sentence on the brief card (seen twice while testing the switch, 16 Sep 2026). Both
// halves get stripped — the whole private-use block, which is never legitimate in a brief,
// and then the turn-N token that survives once the wrappers are gone, in whichever form it
// arrives (turn0search10, turn0news16, ...).
const CITATION_ARTIFACTS = [
  /[\uE000-\uF8FF]/g,
  /(?:cite)?turn\d+[a-z]+\d*/gi,
];

/** Strips provider junk, then rejects anything that isn't actually an answer. */
function cleanUsableText(raw: string, model: string): string {
  const text = CITATION_ARTIFACTS.reduce((acc, p) => acc.replace(p, ""), raw).replace(
    /[ \t]+$/gm,
    ""
  );

  if (!text.trim()) throw new AIBlockedError(`${model} returned an empty completion.`);
  if (isProviderBlockText(text)) {
    throw new AIBlockedError(`${model} refused: ${text.trim().slice(0, 160)}`);
  }
  return text;
}

export type AiChatMessage = { role: "user" | "assistant"; content: string };

export type ToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON schema, shared across families
};

type NormalizedResult = {
  text: string;
  toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }>;
};

/** The models this install will try, in order. Lead first. */
export function modelChain(): string[] {
  const override = (process.env.KIE_MODEL_CHAIN ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return override.length ? override : MODEL_CHAIN;
}

function assertConfigured() {
  const apiKey = process.env.KIE_API_KEY;
  if (!apiKey) throw new AIError("KIE_API_KEY is not set.");
  return { apiKey, models: modelChain() };
}

// kie.ai throws transient upstream errors on both vendors several times an hour — HTTP 500,
// or a 200 carrying {"code":524,"msg":"2 times retry fail"} — and they clear on the next
// call (three of them showed up while testing the GPT switch on 16 Sep 2026). One retry on
// the same model is cheaper than burning the fallback. A refusal or an unsupported model id
// will never heal, so those drop straight through to the next vendor.
const TRANSIENT_ERROR = /\(5\d\d\)|"code"\s*:\s*5\d\d|retry fail|fetch failed|timeout|ECONNRESET|ETIMEDOUT/i;
const TRANSIENT_RETRY_MS = 1000;

function isTransient(err: unknown): boolean {
  return !(err instanceof AIBlockedError) && TRANSIENT_ERROR.test((err as Error)?.message ?? "");
}

async function attemptModel<T>(model: string, attempt: (model: string) => Promise<T>): Promise<T> {
  try {
    return await attempt(model);
  } catch (err) {
    if (!isTransient(err)) throw err;
    console.warn(`kie.ai model ${model} hiccuped (${(err as Error).message}); one more try`);
    await new Promise((resolve) => setTimeout(resolve, TRANSIENT_RETRY_MS));
    return attempt(model);
  }
}

/**
 * Walks the chain until one model answers. When every model fails the error names each
 * with its reason — by then the caller's degraded path is the honest answer, and knowing
 * which models died is what makes the cron's status line debuggable.
 */
async function withModelFallback<T>(
  models: string[],
  attempt: (model: string) => Promise<T>
): Promise<T> {
  const failures: string[] = [];

  for (const [i, model] of models.entries()) {
    try {
      return await attemptModel(model, attempt);
    } catch (err) {
      const reason = (err as Error).message;
      failures.push(`${model}: ${reason}`);
      const next = models[i + 1];
      if (next) console.warn(`kie.ai model ${model} failed (${reason}); retrying on ${next}`);
    }
  }

  throw new AIError(failures.join(" | ") || "No kie.ai model configured.");
}

function isClaudeModel(model: string) {
  return model.startsWith("claude");
}

// ---- Claude family (Anthropic Messages API) --------------------------------------------

type ClaudeContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

type ClaudeMessage = { role: "user" | "assistant"; content: string | ClaudeContentBlock[] };

async function callClaude({
  apiKey,
  model,
  messages,
  system,
  tools,
  maxTokens,
}: {
  apiKey: string;
  model: string;
  messages: ClaudeMessage[];
  system?: string;
  tools?: ToolDefinition[];
  maxTokens: number;
}): Promise<{ content: ClaudeContentBlock[] }> {
  const res = await fetch("https://api.kie.ai/claude/v1/messages", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages,
      stream: false,
      ...(system ? { system } : {}),
      ...(tools?.length
        ? { tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })) }
        : {}),
    }),
  });

  const body = await res.json().catch(() => null);
  if (!res.ok || body?.type === "error") {
    throw new AIError(
      `kie.ai error (${res.status}): ${body?.error?.message ?? JSON.stringify(body).slice(0, 300)}`
    );
  }
  return body;
}

async function runClaudeLoop(params: {
  apiKey: string;
  model: string;
  messages: AiChatMessage[];
  system?: string;
  tools: ToolDefinition[];
  executeTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  maxIterations: number;
}): Promise<string> {
  const history: ClaudeMessage[] = params.messages.map((m) => ({ role: m.role, content: m.content }));

  for (let i = 0; i < params.maxIterations; i++) {
    const response = await callClaude({ ...params, messages: history, maxTokens: 1024 });
    const toolUseBlocks = response.content.filter(
      (b): b is Extract<ClaudeContentBlock, { type: "tool_use" }> => b.type === "tool_use"
    );

    if (toolUseBlocks.length === 0) {
      return response.content
        .filter((b): b is Extract<ClaudeContentBlock, { type: "text" }> => b.type === "text")
        .map((b) => b.text)
        .join("\n");
    }

    history.push({ role: "assistant", content: response.content });
    const resultBlocks: ClaudeContentBlock[] = [];
    for (const block of toolUseBlocks) {
      let result: unknown;
      try {
        result = await params.executeTool(block.name, block.input);
      } catch (err) {
        result = { error: (err as Error).message };
      }
      resultBlocks.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
    }
    history.push({ role: "user", content: resultBlocks });
  }

  return "I wasn't able to finish that within the tool-call limit — try asking something narrower.";
}

// ---- Everything else (OpenAI-compatible chat completions) -----------------------------

type OpenAiToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
type OpenAiMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: OpenAiToolCall[];
  tool_call_id?: string;
};

async function callOpenAiStyle({
  apiKey,
  model,
  messages,
  tools,
}: {
  apiKey: string;
  model: string;
  messages: OpenAiMessage[];
  tools?: ToolDefinition[];
}): Promise<{ message: OpenAiMessage & { tool_calls?: OpenAiToolCall[] } }> {
  const res = await fetch(`https://api.kie.ai/${encodeURIComponent(model)}/v1/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      messages,
      stream: false,
      ...(tools?.length
        ? { tools: tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } })) }
        : {}),
    }),
  });

  const body = await res.json().catch(() => null);
  const message = body?.choices?.[0]?.message;
  if (!res.ok || body?.type === "error" || !message) {
    throw new AIError(
      `kie.ai error (${res.status}): ${body?.error?.message ?? JSON.stringify(body).slice(0, 300)}`
    );
  }
  return { message };
}

async function runOpenAiLoop(params: {
  apiKey: string;
  model: string;
  messages: AiChatMessage[];
  system?: string;
  tools: ToolDefinition[];
  executeTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  maxIterations: number;
}): Promise<string> {
  const history: OpenAiMessage[] = [
    ...(params.system ? [{ role: "system" as const, content: params.system }] : []),
    ...params.messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  for (let i = 0; i < params.maxIterations; i++) {
    const { message } = await callOpenAiStyle({ ...params, messages: history });
    const toolCalls = message.tool_calls ?? [];

    if (toolCalls.length === 0) {
      return message.content ?? "";
    }

    history.push({ role: "assistant", content: message.content ?? "", tool_calls: toolCalls });
    for (const call of toolCalls) {
      let result: unknown;
      try {
        const args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
        result = await params.executeTool(call.function.name, args);
      } catch (err) {
        result = { error: (err as Error).message };
      }
      history.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }

  return "I wasn't able to finish that within the tool-call limit — try asking something narrower.";
}

// ---- Public, family-agnostic API -------------------------------------------------------

/** Single-shot completion with no tools — used by the morning brief and yo-yo hunter. */
export async function generateText(prompt: string, system?: string): Promise<string> {
  const { apiKey, models } = assertConfigured();

  return withModelFallback(models, async (model) => {
    if (isClaudeModel(model)) {
      const response = await callClaude({
        apiKey,
        model,
        messages: [{ role: "user", content: prompt }],
        system,
        maxTokens: 1024,
      });
      const text = response.content
        .filter((b): b is Extract<ClaudeContentBlock, { type: "text" }> => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      return cleanUsableText(text, model);
    }

    const messages: OpenAiMessage[] = [
      ...(system ? [{ role: "system" as const, content: system }] : []),
      { role: "user", content: prompt },
    ];
    const { message } = await callOpenAiStyle({ apiKey, model, messages });
    return cleanUsableText(message.content ?? "", model);
  });
}

/**
 * Runs the tool-call loop: ask the model, execute any tool calls it requests, feed the
 * results back, repeat until it answers with plain text or maxIterations is hit.
 */
export async function runAgentLoop({
  messages,
  system,
  tools,
  executeTool,
  maxIterations = 5,
}: {
  messages: AiChatMessage[];
  system?: string;
  tools: ToolDefinition[];
  executeTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  maxIterations?: number;
}): Promise<string> {
  const { apiKey, models } = assertConfigured();
  // Replaying the whole loop on the next model is safe: every AI tool is a read.
  return withModelFallback(models, async (model) => {
    const run = isClaudeModel(model) ? runClaudeLoop : runOpenAiLoop;
    const text = await run({
      apiKey,
      model,
      messages,
      system,
      tools,
      executeTool,
      maxIterations,
    });
    return cleanUsableText(text, model);
  });
}
