import type { CalendarView, ProjectSort } from "@jakab/shared";
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
  /** The signed-in person's own settings. */
  preferences: { calendarView: CalendarView | null; projectSort: ProjectSort | null };
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
/** A project as the project tree shows it. */
export interface ProjectTreeItem extends ProjectListItem {
  folderId: string | null;
  /** Latest change to the note or to one of its cards (ISO date). */
  lastModified: string;
}
export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
}
export interface ProjectSuggestion extends ProjectListItem {
  folderId: string | null;
  focusCard: { id: string; start: string } | null;
}

export interface TemplateDefaults {
  statusId: string | null;
  labelIds: string[];
  memberIds: string[];
  durationMin: number;
  checklist: string[];
}
export interface TemplateItem {
  id: string;
  name: string;
  defaults: TemplateDefaults;
  hasNote: boolean;
  updatedAt: string;
}
export interface TemplateFull extends TemplateItem {
  note: { type: "doc"; content?: unknown[] } | null;
}

/** Answer of the header search: projects by name, then projects whose note contains the words. */
export interface SearchResults {
  projects: ProjectSuggestion[];
  notes: {
    id: string;
    name: string;
    folderId: string | null;
    statusId: string;
    snippet: { before: string; match: string; after: string };
  }[];
}
