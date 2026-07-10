import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { AIError, runAgentLoop, type AiChatMessage } from "@/lib/ai/client";
import { AI_TOOLS, executeAiTool } from "@/lib/ai/tools";
import { CHAT_SYSTEM_PROMPT } from "@/lib/ai/prompts";

const HISTORY_LIMIT = 20; // turns sent to the LLM as conversation context
const DISPLAY_LIMIT = 50; // turns the drawer renders

export async function GET() {
  // Latest N, returned oldest-first for rendering. (asc + take returned the
  // oldest N ever stored, freezing the drawer on the first page of history.)
  const messages = await prisma.chatMessage.findMany({
    orderBy: { createdAt: "desc" },
    take: DISPLAY_LIMIT,
  });
  return NextResponse.json(messages.reverse());
}

export async function DELETE() {
  await prisma.chatMessage.deleteMany();
  return NextResponse.json({ cleared: true });
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

  try {
    const reply = await runAgentLoop({
      messages: [...history, { role: "user", content: userMessage }],
      system: CHAT_SYSTEM_PROMPT,
      tools: AI_TOOLS,
      executeTool: executeAiTool,
    });

    // Persist both turns together, only on success — a failed call shouldn't leave an
    // unanswered question sitting in history for the next turn to trip over. Sequential
    // (not createMany) so createdAt strictly orders user before assistant.
    await prisma.chatMessage.create({ data: { role: "user", content: userMessage } });
    await prisma.chatMessage.create({ data: { role: "assistant", content: reply } });
    return NextResponse.json({ reply });
  } catch (err) {
    const message = err instanceof AIError ? err.message : "The chat assistant hit an unexpected error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
