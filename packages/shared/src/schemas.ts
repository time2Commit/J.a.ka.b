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
  })
  .refine((v) => Boolean(v.projectId) !== Boolean(v.projectName), {
    message: "Provide either projectId or projectName",
    path: ["projectName"],
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

export const cardRangeQuerySchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
});

export type StatusInput = z.infer<typeof statusInputSchema>;
export type LabelInput = z.infer<typeof labelInputSchema>;
export type UserCreateInput = z.infer<typeof userCreateSchema>;
export type CardCreateInput = z.infer<typeof cardCreateSchema>;
export type CardUpdateInput = z.infer<typeof cardUpdateSchema>;
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
