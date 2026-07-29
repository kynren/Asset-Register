import { FormEvent, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";

interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  text: string;
  data?: unknown;
}

let idCounter = 0;

export function AssistantPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: idCounter++, role: "assistant", text: "Hi, I'm the Kynren Asset Assistant. Ask me about assets, tickets, stock, or devices — or try a quick action below." },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: quickActionsData } = useQuery({
    queryKey: ["assistant-quick-actions"],
    queryFn: async () => (await axiosClient.get("/assistant/quick-actions")).data.quickActions as string[],
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function sendQuery(text: string) {
    if (!text.trim() || sending) return;
    setMessages((m) => [...m, { id: idCounter++, role: "user", text }]);
    setInput("");
    setSending(true);
    try {
      const res = await axiosClient.post("/assistant/query", { text });
      setMessages((m) => [...m, { id: idCounter++, role: "assistant", text: res.data.answer, data: res.data.data }]);
    } catch {
      setMessages((m) => [...m, { id: idCounter++, role: "assistant", text: "Sorry, something went wrong answering that." }]);
    } finally {
      setSending(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    sendQuery(input);
  }

  return (
    <div className="stack gap-3">
      <div className="page-header">
        <div>
          <h1 className="page-title">Virtual Assistant</h1>
          <p className="page-subtitle">Ask quick questions about your assets, tickets, stock, and devices.</p>
        </div>
      </div>

      <div className="card">
        <div className="chat-window" ref={scrollRef}>
          {messages.map((m) => (
            <div key={m.id} className={`chat-bubble ${m.role}`}>
              {m.text}
              {Array.isArray(m.data) && m.data.length > 0 && (
                <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                  {m.data.slice(0, 8).map((item: any, i: number) => (
                    <li key={i} style={{ fontSize: 12 }}>{summarizeItem(item)}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>

        <div className="row gap-1 flex-wrap" style={{ margin: "12px 0" }}>
          {quickActionsData?.map((q) => (
            <button key={q} type="button" className="quick-action" onClick={() => sendQuery(q)}>{q}</button>
          ))}
        </div>

        <form className="row gap-2" onSubmit={handleSubmit}>
          <input className="input" placeholder="Ask something..." value={input} onChange={(e) => setInput(e.target.value)} />
          <button className="btn btn-primary" type="submit" disabled={sending}>Send</button>
        </form>
      </div>
    </div>
  );
}

function summarizeItem(item: any): string {
  if (item.ticketNumber) return `${item.ticketNumber} — ${item.title} (${item.status})`;
  if (item.sku) return `${item.sku} — ${item.name}: ${item.quantityOnHand} on hand (reorder at ${item.reorderLevel})`;
  if (item.hostname) return `${item.hostname} (${item.macAddress})`;
  if (item.assetTag) return `${item.assetTag} — ${item.name}`;
  return JSON.stringify(item);
}
