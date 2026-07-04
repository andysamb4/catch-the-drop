// kie.ai abstraction layer. Confirmed working by direct testing: Claude models are served
// from a dedicated endpoint that mirrors Anthropic's native Messages API (not OpenAI chat
// completions) — https://api.kie.ai/claude/v1/messages, system prompt as a top-level field,
// tool calls as `tool_use` content blocks, results sent back as `tool_result` blocks.
const KIE_CLAUDE_URL = "https://api.kie.ai/claude/v1/messages";

export class AIError extends Error {}

export type ChatRole = "user" | "assistant";

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

export type AiChatMessage = {
  role: ChatRole;
  content: string | ContentBlock[];
};

export type ToolDefinition = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
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

type MessagesResponse = {
  content: ContentBlock[];
  stop_reason: string;
};

async function callMessages({
  messages,
  system,
  tools,
  maxTokens = 1024,
}: {
  messages: AiChatMessage[];
  system?: string;
  tools?: ToolDefinition[];
  maxTokens?: number;
}): Promise<MessagesResponse> {
  const { apiKey, model } = assertConfigured();

  const res = await fetch(KIE_CLAUDE_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages,
      stream: false,
      ...(system ? { system } : {}),
      ...(tools?.length ? { tools } : {}),
    }),
  });

  const body = await res.json().catch(() => null);
  if (!res.ok || body?.type === "error") {
    throw new AIError(
      `kie.ai error (${res.status}): ${body?.error?.message ?? JSON.stringify(body).slice(0, 300)}`
    );
  }

  return body as MessagesResponse;
}

function textFrom(content: ContentBlock[]): string {
  return content
    .filter((b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

/** Single-shot completion with no tools — used by the morning brief and yo-yo hunter. */
export async function generateText(prompt: string, system?: string): Promise<string> {
  const response = await callMessages({ messages: [{ role: "user", content: prompt }], system });
  return textFrom(response.content);
}

/**
 * Runs the tool-call loop: ask the model, execute any tool_use blocks it requests, feed the
 * results back as tool_result blocks, repeat until it answers with plain text or
 * maxIterations is hit.
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
  const history = [...messages];

  for (let i = 0; i < maxIterations; i++) {
    const response = await callMessages({ messages: history, system, tools });

    const toolUseBlocks = response.content.filter(
      (b): b is Extract<ContentBlock, { type: "tool_use" }> => b.type === "tool_use"
    );

    if (toolUseBlocks.length === 0) {
      return textFrom(response.content);
    }

    history.push({ role: "assistant", content: response.content });

    const resultBlocks: ContentBlock[] = [];
    for (const block of toolUseBlocks) {
      let result: unknown;
      try {
        result = await executeTool(block.name, block.input);
      } catch (err) {
        result = { error: (err as Error).message };
      }
      resultBlocks.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
    }
    history.push({ role: "user", content: resultBlocks });
  }

  return "I wasn't able to finish that within the tool-call limit — try asking something narrower.";
}
