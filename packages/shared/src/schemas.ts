import { z } from "zod";

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Expected a #rrggbb color");
const progress = z.number().int().min(0).max(100);
const id = z.string().min(1);

export const statusInputSchema = z.object({
  name: z.string().trim().min(1).max(40),
  color: hexColor,
  isDone: z.boolean().default(false),
});
export const statusUpdateSchema = statusInputSchema.partial();
export const statusReorderSchema = z.object({ ids: z.array(id).min(1) });

export const labelInputSchema = z.object({
  name: z.string().trim().min(1).max(40),
  color: hexColor,
});
export const labelUpdateSchema = labelInputSchema.partial();

export const userCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(128),
  role: z.enum(["admin", "member"]).default("member"),
});

const dateRange = (value: { start: Date; end: Date }) => value.end >= value.start;
const rangeMessage = { message: "end must not be before start", path: ["end"] };

export const cardCreateSchema = z
  .object({
    /** Existing project to link; when absent a new project is created from `projectName`. */
    projectId: id.optional(),
    projectName: z.string().trim().min(1).max(120).optional(),
    title: z.string().trim().max(120).optional(),
    start: z.coerce.date(),
    end: z.coerce.date(),
    allDay: z.boolean().default(false),
    shortNotes: z.string().max(2000).optional(),
    statusId: id.optional(),
    labelIds: z.array(id).default([]),
    memberIds: z.array(id).default([]),
    /** New projects only: start from a template... */
    templateId: id.optional(),
    /** ...or from a copy of an existing project (settings, and the note with its files). */
    cloneFromProjectId: id.optional(),
    /** Copy the note (and its files) too; true when omitted. */
    cloneNote: z.boolean().optional(),
  })
  .refine((v) => Boolean(v.projectId) !== Boolean(v.projectName), {
    message: "Provide either projectId or projectName",
    path: ["projectName"],
  })
  .refine((v) => !(v.templateId && v.cloneFromProjectId), {
    message: "Choose either a template or a project to clone",
    path: ["cloneFromProjectId"],
  })
  .refine((v) => !(v.projectId && (v.templateId || v.cloneFromProjectId)), {
    message: "A template or clone source applies to new projects only",
    path: ["templateId"],
  })
  .refine(dateRange, rangeMessage);

export const cardUpdateSchema = z
  .object({
    title: z.string().trim().max(120).nullable(),
    start: z.coerce.date(),
    end: z.coerce.date(),
    allDay: z.boolean(),
    shortNotes: z.string().max(2000).nullable(),
    statusOverrideId: id.nullable(),
    progressOverride: progress.nullable(),
    labelIds: z.array(id),
    memberIds: z.array(id),
  })
  .partial()
  .refine((v) => !v.start || !v.end || v.end >= v.start, rangeMessage);

export const projectUpdateSchema = z
  .object({
    statusId: id,
    progress,
    color: hexColor.nullable(),
    labelIds: z.array(id),
    memberIds: z.array(id),
  })
  .partial();

/** Body of "save a version": the label is optional. */
export const versionCreateSchema = z.object({
  label: z.string().trim().min(1).max(120).optional(),
});
/** What a template pre-fills when a project is created from it. */
export const templateDefaultsSchema = z.object({
  statusId: id.nullable().default(null),
  labelIds: z.array(id).default([]),
  memberIds: z.array(id).default([]),
  /** Length of the first card, in minutes. */
  durationMin: z
    .number()
    .int()
    .min(5)
    .max(7 * 24 * 60)
    .default(60),
  /** Added to the top of the note as a checklist. */
  checklist: z.array(z.string().trim().min(1).max(200)).max(50).default([]),
});

const noteDoc = z.object({ type: z.literal("doc") }).passthrough();

export const templateInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  defaults: templateDefaultsSchema.default({
    statusId: null,
    labelIds: [],
    memberIds: [],
    durationMin: 60,
    checklist: [],
  }),
  /** Initial note content as editor JSON. */
  note: noteDoc.nullable().default(null),
});
export const templateUpdateSchema = templateInputSchema.partial();

export const saveAsTemplateSchema = z.object({ name: z.string().trim().min(1).max(80) });

export const cardRangeQuerySchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
});

export type StatusInput = z.infer<typeof statusInputSchema>;
export type LabelInput = z.infer<typeof labelInputSchema>;
export type UserCreateInput = z.infer<typeof userCreateSchema>;
export type CardCreateInput = z.infer<typeof cardCreateSchema>;
export type CardUpdateInput = z.infer<typeof cardUpdateSchema>;
export type TemplateDefaults = z.infer<typeof templateDefaultsSchema>;
export type TemplateInput = z.infer<typeof templateInputSchema>;
export type TemplateUpdateInput = z.infer<typeof templateUpdateSchema>;
export type VersionCreateInput = z.infer<typeof versionCreateSchema>;
export type ProjectUpdateInput = z.infer<typeof projectUpdateSchema>;

const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:mm");

export const workspaceUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    timeZone: z.string().refine(
      (tz) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: tz });
          return true;
        } catch {
          return false;
        }
      },
      { message: "Unknown IANA time zone" },
    ),
    workDayStart: clock,
    workDayEnd: clock,
    firstDayOfWeek: z.number().int().min(0).max(6),
  })
  .partial();
