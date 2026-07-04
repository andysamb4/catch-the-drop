import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { AIError, runAgentLoop, type AiChatMessage } from "@/lib/ai/client";
import { AI_TOOLS, executeAiTool } from "@/lib/ai/tools";
import { CHAT_SYSTEM_PROMPT } from "@/lib/ai/prompts";

const HISTORY_LIMIT = 20;

export async function GET() {
  const messages = await prisma.chatMessage.findMany({
    orderBy: { createdAt: "asc" },
    take: HISTORY_LIMIT,
  });
  return NextResponse.json(messages);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const userMessage = typeof body?.message === "string" ? body.message.trim() : "";
  if (!userMessage) {
    return NextResponse.json({ error: "Message is required." }, { status: 400 });
  }

  const recent = await prisma.chatMessage.findMany({
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT,
  });
  const history: AiChatMessage[] = [...recent].reverse().map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  await prisma.chatMessage.create({ data: { role: "user", content: userMessage } });

  try {
    const reply = await runAgentLoop({
      messages: [
        { role: "system", content: CHAT_SYSTEM_PROMPT },
        ...history,
        { role: "user", content: userMessage },
      ],
      tools: AI_TOOLS,
      executeTool: executeAiTool,
    });

    await prisma.chatMessage.create({ data: { role: "assistant", content: reply } });
    return NextResponse.json({ reply });
  } catch (err) {
    const message = err instanceof AIError ? err.message : "The chat assistant hit an unexpected error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
