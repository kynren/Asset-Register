import { FormEvent, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { axiosClient } from "../api/axiosClient";
import { Icon } from "../components/Icon";
import { usePermission } from "../auth/PermissionGate";

interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  text: string;
}

let idCounter = 0;

export function FloatingAssistant() {
  const canUse = usePermission("virtual-assistant", "view");
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: idCounter++, role: "assistant", text: "Hi! Ask me a quick question about assets, tickets, stock, or devices." },
  ]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const { data: quickActions } = useQuery({
    queryKey: ["assistant-quick-actions"],
    queryFn: async () => (await axiosClient.get("/assistant/quick-actions")).data.quickActions as string[],
    enabled: canUse && open,
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  if (!canUse) return null;

  async function sendQuery(text: string) {
    if (!text.trim() || sending) return;
    setMessages((m) => [...m, { id: idCounter++, role: "user", text }]);
    setInput("");
    setSending(true);
    try {
      const res = await axiosClient.post("/assistant/query", { text });
      setMessages((m) => [...m, { id: idCounter++, role: "assistant", text: res.data.answer }]);
    } catch {
      setMessages((m) => [...m, { id: idCounter++, role: "assistant", text: "Sorry, something went wrong." }]);
    } finally {
      setSending(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    sendQuery(input);
  }

  return (
    <>
      {open && (
        <div className="floating-assistant-panel card">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
            <strong style={{ fontSize: 13 }}>Virtual Assistant</strong>
            <div className="row gap-1">
              <button className="btn btn-secondary btn-sm btn-icon" onClick={() => navigate("/assistant")} title="Open full page">
                <Icon name="chevronRight" size={12} />
              </button>
              <button className="btn btn-secondary btn-sm btn-icon" onClick={() => setOpen(false)}>
                <Icon name="close" size={13} />
              </button>
            </div>
          </div>

          <div className="chat-window" ref={scrollRef} style={{ height: 280 }}>
            {messages.map((m) => (
              <div key={m.id} className={`chat-bubble ${m.role}`} style={{ fontSize: 12.5 }}>{m.text}</div>
            ))}
          </div>

          <div className="row gap-1 flex-wrap" style={{ margin: "8px 0" }}>
            {quickActions?.slice(0, 3).map((q) => (
              <button key={q} type="button" className="quick-action" style={{ fontSize: 11 }} onClick={() => sendQuery(q)}>{q}</button>
            ))}
          </div>

          <form className="row gap-2" onSubmit={handleSubmit}>
            <input className="input" placeholder="Ask something..." value={input} onChange={(e) => setInput(e.target.value)} />
            <button className="btn btn-primary btn-sm" type="submit" disabled={sending}>Send</button>
          </form>
        </div>
      )}

      <button className="floating-assistant-fab" onClick={() => setOpen((o) => !o)} title="Virtual Assistant">
        <Icon name={open ? "close" : "chat"} size={22} />
      </button>
    </>
  );
}
