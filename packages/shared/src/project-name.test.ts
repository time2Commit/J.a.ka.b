import { describe, expect, it } from "vitest";
import { normalizeProjectName } from "./project-name";

describe("normalizeProjectName", () => {
  it("rimuove accenti, maiuscole e spazi superflui", () => {
    expect(normalizeProjectName("  Città   di Forlì ")).toBe("citta di forli");
  });

  it("lascia invariato un nome già normalizzato", () => {
    expect(normalizeProjectName("cliente x")).toBe("cliente x");
  });
});
