import { describe, expect, it } from "vitest";
import { parseTrustedProxies } from "./trusted-proxies";

describe("parseTrustedProxies", () => {
  it("reads addresses separated by spaces or commas", () => {
    expect(parseTrustedProxies("10.0.0.0/8, 192.168.1.5  172.16.0.0/12")).toEqual([
      "10.0.0.0/8",
      "192.168.1.5",
      "172.16.0.0/12",
    ]);
  });

  it("is empty when nothing is set", () => {
    expect(parseTrustedProxies(undefined)).toEqual([]);
    expect(parseTrustedProxies("  ")).toEqual([]);
  });
});
