"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";

type Message = { id: string; role: string; content: string };

export function ChatDrawer() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    fetch("/api/chat")
      .then((res) => (res.ok ? res.json() : []))
      .then(setMessages)
      .catch(() => {});
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    const text = input.trim();
    if (!text || isSending) return;
    setInput("");
    setError(null);
    setMessages((m) => [...m, { id: `local-${Date.now()}`, role: "user", content: text }]);
    setIsSending(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Something went wrong.");
        return;
      }
      setMessages((m) => [...m, { id: `local-${Date.now()}-r`, role: "assistant", content: data.reply }]);
    } catch {
      setError("Couldn't reach the assistant. Check your connection.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <>
      <Button
        size="icon"
        className="fixed right-4 z-40 h-12 w-12 rounded-full shadow-lg"
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 4.5rem)" }}
        onClick={() => setOpen(true)}
        aria-label="Open assistant"
      >
        <MessageCircle className="h-5 w-5" />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl p-0">
          <SheetHeader className="border-b border-border px-4 py-3">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />
              Assistant
            </SheetTitle>
          </SheetHeader>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {messages.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Ask about your watchlist, signals, or trades.
              </p>
            )}
            {messages.map((m) => (
              <div
                key={m.id}
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                  m.role === "user"
                    ? "ml-auto bg-primary text-primary-foreground"
                    : "mr-auto bg-muted text-foreground"
                }`}
              >
                {m.content}
              </div>
            ))}
            {isSending && (
              <div className="mr-auto max-w-[85%] rounded-2xl bg-muted px-3 py-2 text-sm text-muted-foreground">
                Thinking...
              </div>
            )}
            {error && (
              <div className="mr-auto max-w-[90%] rounded-2xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
          </div>

          <div className="flex gap-2 border-t border-border p-3 pb-safe-nav">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask the assistant..."
              disabled={isSending}
            />
            <Button size="icon" onClick={handleSend} disabled={isSending || !input.trim()} aria-label="Send">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
