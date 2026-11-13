import { streamingReleases } from "./streaming-releases";
import { testFixtureSource } from "./test-fixture";
import type { Source } from "./types";

const SOURCES: Source[] = [streamingReleases];

/**
 * The sources an admin can connect. Adding one means a file and a line here. A fixture source that
 * needs no provider is added only when the test environment asks for it (`JAKAB_TEST_SOURCES=1`),
 * so the end-to-end suite can connect one without the internet.
 */
export function listSources(): Source[] {
  return process.env.JAKAB_TEST_SOURCES === "1" ? [...SOURCES, testFixtureSource] : SOURCES;
}

export const getSource = (kind: string) => listSources().find((s) => s.kind === kind) ?? null;
