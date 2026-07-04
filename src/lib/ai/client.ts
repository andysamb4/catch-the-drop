// kie.ai abstraction layer. The exact model string is configured via KIE_MODEL so the
// model can be swapped without code changes. Endpoint confirmed by probing:
// https://api.kie.ai/api/v1/chat/completions accepts an OpenAI-shaped { model, messages }
// body, but wraps its response in a { code, msg, data } envelope — unwrapped defensively
// below in case a given backend model returns the OpenAI shape directly instead.
const KIE_BASE_URL = "https://api.kie.ai/api/v1";

export class AIError extends Error {}

export type ChatRole = "system" | "user" | "assistant" | "tool";

export type AiToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type AiChatMessage = {
  role: ChatRole;
  content: string | null;
  tool_calls?: AiToolCall[];
  tool_call_id?: string;
  name?: string;
};

export type ToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
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

export async function chatCompletion({
  messages,
  tools,
}: {
  messages: AiChatMessage[];
  tools?: ToolDefinition[];
}): Promise<{ content: string | null; toolCalls: AiToolCall[] }> {
  const { apiKey, model } = assertConfigured();

  const res = await fetch(`${KIE_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      ...(tools?.length ? { tools, tool_choice: "auto" } : {}),
    }),
  });

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new AIError(`kie.ai request failed (${res.status}): ${JSON.stringify(body).slice(0, 500)}`);
  }

  const completion = body?.data ?? body;
  if (typeof completion?.code === "number" && completion.code !== 200 && completion.code !== 0) {
    throw new AIError(`kie.ai error: ${completion.msg ?? "unknown error"}`);
  }

  const message = completion?.choices?.[0]?.message;
  if (!message) {
    throw new AIError(`Unexpected kie.ai response shape: ${JSON.stringify(body).slice(0, 500)}`);
  }

  return { content: message.content ?? null, toolCalls: message.tool_calls ?? [] };
}

/** Single-shot completion with no tools — used by the morning brief and yo-yo hunter. */
export async function generateText(prompt: string, system?: string): Promise<string> {
  const messages: AiChatMessage[] = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: prompt });
  const { content } = await chatCompletion({ messages });
  return content ?? "";
}

/**
 * Runs the tool-call loop: ask the model, execute any tool calls it requests, feed the
 * results back, repeat until it answers directly or maxIterations is hit.
 */
export async function runAgentLoop({
  messages,
  tools,
  executeTool,
  maxIterations = 5,
}: {
  messages: AiChatMessage[];
  tools: ToolDefinition[];
  executeTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  maxIterations?: number;
}): Promise<string> {
  const history = [...messages];

  for (let i = 0; i < maxIterations; i++) {
    const { content, toolCalls } = await chatCompletion({ messages: history, tools });

    if (!toolCalls.length) {
      return content ?? "";
    }

    history.push({ role: "assistant", content, tool_calls: toolCalls });

    for (const call of toolCalls) {
      let result: unknown;
      try {
        const args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
        result = await executeTool(call.function.name, args);
      } catch (err) {
        result = { error: (err as Error).message };
      }
      history.push({
        role: "tool",
        tool_call_id: call.id,
        name: call.function.name,
        content: JSON.stringify(result),
      });
    }
  }

  return "I wasn't able to finish that within the tool-call limit — try asking something narrower.";
}
