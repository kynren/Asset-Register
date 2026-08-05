export type ProjectStatus = "TODO" | "IN_PROGRESS" | "REVIEW" | "DONE";
export type ProjectVisibility = "PUBLIC" | "PRIVATE" | "RESTRICTED";

export const PROJECT_STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: "TODO", label: "To Do" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "REVIEW", label: "Review" },
  { value: "DONE", label: "Done" },
];

interface UserRef {
  id: number;
  firstName: string;
  lastName: string;
}

export interface ProjectCard {
  id: number;
  title: string;
  description: string | null;
  status: ProjectStatus;
  visibility: ProjectVisibility;
  assigneeId: number | null;
  assignee: UserRef | null;
  startDate: string | null;
  dueDate: string | null;
  createdById: number;
  createdBy: UserRef;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeArticle {
  id: number;
  title: string;
  content: string;
  category: string | null;
  createdById: number;
  createdBy: UserRef;
  createdAt: string;
  updatedAt: string;
}

export interface AssetBooking {
  id: number;
  assetId: number;
  asset: { id: number; assetTag: string; name: string };
  bookedBy: UserRef;
  startAt: string;
  endAt: string;
  purpose: string | null;
  createdAt: string;
}
