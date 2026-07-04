// kie.ai abstraction layer. Confirmed by direct testing that kie.ai serves different model
// families from different endpoints with different wire formats — there's no single
// unified API:
//   - Claude models: https://api.kie.ai/claude/v1/messages, mirrors Anthropic's native
//     Messages API (system as a top-level field, tool_use/tool_result content blocks).
//   - Everything else (Gemini, GPT, ...): https://api.kie.ai/{model}/v1/chat/completions,
//     standard OpenAI chat-completions shape (tools array, tool_calls, role:"tool").
// KIE_MODEL picks the model; the family (and therefore the endpoint/wire format) is
// inferred from its name so callers never need to know which shape is in play.
export class AIError extends Error {}

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
  return { apiKey, model };
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
  const { apiKey, model } = assertConfigured();

  if (isClaudeModel(model)) {
    const response = await callClaude({
      apiKey,
      model,
      messages: [{ role: "user", content: prompt }],
      system,
      maxTokens: 1024,
    });
    return response.content
      .filter((b): b is Extract<ClaudeContentBlock, { type: "text" }> => b.type === "text")
      .map((b) => b.text)
      .join("\n");
  }

  const messages: OpenAiMessage[] = [
    ...(system ? [{ role: "system" as const, content: system }] : []),
    { role: "user", content: prompt },
  ];
  const { message } = await callOpenAiStyle({ apiKey, model, messages });
  return message.content ?? "";
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
  const { apiKey, model } = assertConfigured();
  const run = isClaudeModel(model) ? runClaudeLoop : runOpenAiLoop;
  return run({ apiKey, model, messages, system, tools, executeTool, maxIterations });
}
