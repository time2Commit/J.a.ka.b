import { describe, expect, it } from "vitest";
import { normalizeProjectName } from "./project-name";

describe("normalizeProjectName", () => {
  it("strips accents, uppercase and extra whitespace", () => {
    expect(normalizeProjectName("  Città   di Forlì ")).toBe("citta di forli");
  });

  it("leaves an already normalized name unchanged", () => {
    expect(normalizeProjectName("cliente x")).toBe("cliente x");
  });
});
