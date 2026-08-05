export interface AssistantResult {
  answer: string;
  data?: unknown;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
}
