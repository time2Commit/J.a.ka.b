export type { CardDto } from "@/server/cards";

export interface Status {
  id: string;
  name: string;
  color: string;
  order: number;
  isDone: boolean;
}
export interface Label {
  id: string;
  name: string;
  color: string;
}
export interface Member {
  id: string;
  name: string;
  email: string;
  role: "admin" | "member";
  avatarColor: string;
}
export interface Workspace {
  name: string;
  timeZone: string;
  workDayStart: string;
  workDayEnd: string;
  firstDayOfWeek: number;
}
export interface Meta {
  workspace: Workspace;
  statuses: Status[];
  labels: Label[];
  users: Member[];
}
export interface ProjectDto {
  id: string;
  name: string;
  statusId: string;
  progress: number;
  color: string | null;
  labelIds: string[];
  memberIds: string[];
}
export interface ProjectListItem {
  id: string;
  name: string;
  statusId: string;
  progress: number;
  lastCardEnd: string | null;
}
export interface ProjectSuggestion extends ProjectListItem {
  focusCard: { id: string; start: string } | null;
}
