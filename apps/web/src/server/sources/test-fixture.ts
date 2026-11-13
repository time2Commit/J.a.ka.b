import { z } from "zod";
import { dayInZone, dayStartUtc, nextDayStartUtc } from "./days";
import { defineSource } from "./types";

/**
 * A source with no provider, for the end-to-end tests only (see `registry.ts`): it reports one
 * all-day event today, in the workspace time zone, and never touches the network.
 */
export const testFixtureSource = defineSource({
  kind: "test-fixture",
  name: "Test fixture",
  attribution: { name: "Test fixture", url: "https://example.com/" },
  hosts: [],
  intervalHours: 24,
  credentialsSchema: null,
  configSchema: z.object({}),
  verifyConfigSchema: z.object({}),
  stateSchema: z.object({ runs: z.number().int().min(0) }),
  initialState: () => ({ runs: 0 }),
  detailsSchema: z.object({ note: z.string().max(200) }),
  verify: async () => ({ ok: true }),
  sync: async ({ state }, ctx) => {
    const day = dayInZone(ctx.now, ctx.timeZone);
    return {
      events: [
        {
          externalId: `fixture:${day}`,
          title: "Fixture arrival",
          start: dayStartUtc(day),
          end: nextDayStartUtc(day),
          allDay: true,
          url: "https://example.com/title",
          details: { note: "<b>plain text, never HTML</b>" },
        },
      ],
      state: { runs: state.runs + 1 },
    };
  },
});
