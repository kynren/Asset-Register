export type TicketStatus = "OPEN" | "IN_PROGRESS" | "PENDING" | "RESOLVED" | "CLOSED";
export type TicketPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type TicketItilType = "INCIDENT" | "REQUEST" | "PROBLEM" | "CHANGE";

export interface TicketCategory {
  id: number;
  name: string;
}

export interface TicketUserRef {
  id: number;
  firstName: string;
  lastName: string;
}

export interface TicketComment {
  id: number;
  body: string;
  isInternal: boolean;
  createdAt: string;
  author: { firstName: string; lastName: string } | null;
}

export interface TicketAssignee {
  user: TicketUserRef;
}

export interface TicketTask {
  id: number;
  content: string;
  category: string | null;
  state: "TODO" | "DONE";
  isPrivate: boolean;
  actionTimeSeconds: number | null;
  authorId: number;
  createdAt: string;
  author: TicketUserRef | null;
  assignedTo: TicketUserRef | null;
}

export interface TicketSolution {
  id: number;
  content: string;
  status: "WAITING" | "ACCEPTED" | "REFUSED";
  createdAt: string;
  author: TicketUserRef;
  answeredBy: TicketUserRef | null;
  answeredAt: string | null;
  answerComment: string | null;
}

export interface TicketApproval {
  id: number;
  status: "WAITING" | "ACCEPTED" | "REFUSED";
  comment: string | null;
  createdAt: string;
  requestedBy: TicketUserRef;
  targetUserId: number | null;
  targetTeamId: number | null;
  targetUser: TicketUserRef | null;
  targetTeam: { id: number; name: string } | null;
  answeredBy: TicketUserRef | null;
  answeredAt: string | null;
  answerComment: string | null;
}

export interface TicketLink {
  id: number;
  linkType: "RELATES_TO" | "CAUSES" | "CAUSED_BY" | "DUPLICATES";
  linkedTicket?: { id: number; ticketNumber: string; title: string; status: TicketStatus };
  ticket?: { id: number; ticketNumber: string; title: string; status: TicketStatus };
}

export interface TicketKnowledgeLink {
  id: number;
  article: { id: number; title: string };
}

export interface TicketAttachment {
  id: number;
  filename: string;
  sizeBytes: number;
  commentId: number | null;
  createdAt: string;
}

export interface Ticket {
  id: number;
  ticketNumber: string;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  itilType: TicketItilType;
  type: "ACTION" | "INFORMATION";
  requesterId: number;
  requester: TicketUserRef | null;
  assignees: TicketAssignee[];
  assignedTeams?: { team: { id: number; name: string } }[];
  category: TicketCategory | null;
  asset: { id: number; assetTag: string; name: string } | null;
  location: { id: number; name: string } | null;
  dueAt: string | null;
  createdAt: string;
  isWatching?: boolean;
  satisfactionRating?: number | null;
  satisfactionComment?: string | null;
  comments?: TicketComment[];
  tasks?: TicketTask[];
  solutions?: TicketSolution[];
  approvals?: TicketApproval[];
  linksFrom?: TicketLink[];
  linksTo?: TicketLink[];
  knowledgeArticles?: TicketKnowledgeLink[];
  attachments?: TicketAttachment[];
}

export const TICKET_STATUS_OPTIONS: { value: TicketStatus; label: string }[] = [
  { value: "OPEN", label: "Open" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "PENDING", label: "Pending" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "CLOSED", label: "Closed" },
];

export const TICKET_PRIORITY_OPTIONS: { value: TicketPriority; label: string }[] = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
];
