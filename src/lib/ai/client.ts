// kie.ai abstraction layer. Confirmed by direct testing that kie.ai serves different model
// families from different endpoints with different wire formats — there's no single
// unified API:
//   - Claude models: https://api.kie.ai/claude/v1/messages, mirrors Anthropic's native
//     Messages API (system as a top-level field, tool_use/tool_result content blocks).
//   - Everything else (Gemini, GPT, ...): https://api.kie.ai/{model}/v1/chat/completions,
//     standard OpenAI chat-completions shape (tools array, tool_calls, role:"tool").
// KIE_MODEL picks the model; the family (and therefore the endpoint/wire format) is
// inferred from its name so callers never need to know which shape is in play.
//
// One model is not enough in practice. kie.ai's Gemini upstream intermittently answers
// with an account-level "Prohibited Use Policy" refusal — HTTP 200, normal completion
// shape, the refusal text sitting where the answer should be (15 Sep 2026: it rendered
// verbatim on the home page's morning-brief card). So every call runs KIE_MODEL first and
// retries once on KIE_FALLBACK_MODEL, which defaults to a DIFFERENT vendor's model: a
// refusal is a property of that vendor's policy layer, so retrying the same one is futile.
export class AIError extends Error {}

/**
 * A response another vendor could plausibly answer: a refusal dressed up as a completion,
 * or an empty one. Its own class so the fallback fires on a decision, not on a guess.
 */
export class AIBlockedError extends AIError {}

// GPT 5.2 — the GPT chat model kie.ai actually serves on this key (gpt-5-5, gpt-6-astra
// and friends answer "the model is not supported"), priced within pennies of the Gemini
// default: $0.44/M in, $3.50/M out.
const DEFAULT_FALLBACK_MODEL = "gpt-5-2";

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

function assertUsable(text: string, model: string): string {
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

function assertConfigured() {
  const apiKey = process.env.KIE_API_KEY;
  const model = process.env.KIE_MODEL;
  if (!apiKey) throw new AIError("KIE_API_KEY is not set.");
  if (!model || model.startsWith("REPLACE_WITH_")) {
    throw new AIError("KIE_MODEL is not configured with a real model ID yet.");
  }
  // Set KIE_FALLBACK_MODEL to "" to opt out; pointing it at the primary amounts to the same.
  const fallback = process.env.KIE_FALLBACK_MODEL ?? DEFAULT_FALLBACK_MODEL;
  return { apiKey, model, fallbackModel: fallback && fallback !== model ? fallback : null };
}

/** The same chain assertConfigured resolves, but non-throwing — for the settings page. */
export function modelChain(): { model: string | null; fallbackModel: string | null } {
  const raw = process.env.KIE_MODEL;
  const model = raw && !raw.startsWith("REPLACE_WITH_") ? raw : null;
  const fallback = process.env.KIE_FALLBACK_MODEL ?? DEFAULT_FALLBACK_MODEL;
  return { model, fallbackModel: fallback && fallback !== model ? fallback : null };
}

/**
 * Runs `attempt` on the primary model, then once more on the fallback if it failed in a way
 * a different vendor could survive. When both die the error names both — by then the
 * caller's degraded path is the honest answer, and knowing which pair failed is what makes
 * the cron's status line debuggable.
 */
async function withModelFallback<T>(
  { model, fallbackModel }: { model: string; fallbackModel: string | null },
  attempt: (model: string) => Promise<T>
): Promise<T> {
  try {
    return await attempt(model);
  } catch (err) {
    if (!fallbackModel) throw err;
    const reason = (err as Error).message;
    console.warn(`kie.ai model ${model} failed (${reason}); retrying on ${fallbackModel}`);
    try {
      return await attempt(fallbackModel);
    } catch (fallbackErr) {
      throw new AIError(`${model}: ${reason} | ${fallbackModel}: ${(fallbackErr as Error).message}`);
    }
  }
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
  const config = assertConfigured();
  const { apiKey } = config;

  return withModelFallback(config, async (model) => {
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
      return assertUsable(text, model);
    }

    const messages: OpenAiMessage[] = [
      ...(system ? [{ role: "system" as const, content: system }] : []),
      { role: "user", content: prompt },
    ];
    const { message } = await callOpenAiStyle({ apiKey, model, messages });
    return assertUsable(message.content ?? "", model);
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
  const config = assertConfigured();
  // Replaying the whole loop on the fallback is safe: every AI tool is a read.
  return withModelFallback(config, async (model) => {
    const run = isClaudeModel(model) ? runClaudeLoop : runOpenAiLoop;
    const text = await run({
      apiKey: config.apiKey,
      model,
      messages,
      system,
      tools,
      executeTool,
      maxIterations,
    });
    return assertUsable(text, model);
  });
}
