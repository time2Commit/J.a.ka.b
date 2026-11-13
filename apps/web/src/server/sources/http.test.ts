import { describe, expect, it, vi } from "vitest";
import { createSourceFetch, SourceHttpError } from "./http";

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, ...init });

describe("source fetch", () => {
  it("fetches an allowed https host and parses the JSON", async () => {
    const impl = vi.fn(async () => json({ hello: "world" }));
    const fetchSource = createSourceFetch(["api.example.com"], { impl });
    const res = await fetchSource("https://api.example.com/v1/x?y=1", {
      headers: { "X-API-Key": "k" },
    });
    expect(res).toEqual({ status: 200, body: { hello: "world" } });
    const [url, init] = impl.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.example.com/v1/x?y=1");
    expect(init.redirect).toBe("manual");
    expect(init.credentials).toBe("omit");
    expect((init.headers as Record<string, string>)["X-API-Key"]).toBe("k");
  });

  it("returns an error status with its body instead of throwing", async () => {
    const fetchSource = createSourceFetch(["api.example.com"], {
      impl: async () => json({ message: "no" }, { status: 401 }),
    });
    expect(await fetchSource("https://api.example.com/")).toEqual({
      status: 401,
      body: { message: "no" },
    });
  });

  it("refuses a host the source did not declare, without sending anything", async () => {
    const impl = vi.fn(async () => json({}));
    const fetchSource = createSourceFetch(["api.example.com"], { impl });
    for (const url of [
      "https://evil.example.com/",
      "https://api.example.com.evil.test/",
      "https://127.0.0.1/",
      "https://localhost/",
      "https://169.254.169.254/latest/meta-data",
    ]) {
      await expect(fetchSource(url)).rejects.toThrow("Host not allowed");
    }
    expect(impl).not.toHaveBeenCalled();
  });

  it("refuses anything but plain https", async () => {
    const impl = vi.fn(async () => json({}));
    const fetchSource = createSourceFetch(["api.example.com"], { impl });
    for (const url of [
      "http://api.example.com/",
      "https://api.example.com:8443/",
      `https://${"user"}:${"pw"}@api.example.com/`,
      "ftp://api.example.com/",
      "not a url",
    ]) {
      await expect(fetchSource(url)).rejects.toBeInstanceOf(SourceHttpError);
    }
    expect(impl).not.toHaveBeenCalled();
  });

  it("does not follow a redirect", async () => {
    const impl = vi.fn(
      async () => new Response(null, { status: 302, headers: { location: "https://evil.test/" } }),
    );
    const fetchSource = createSourceFetch(["api.example.com"], { impl });
    await expect(fetchSource("https://api.example.com/")).rejects.toThrow("redirect");
    expect(impl).toHaveBeenCalledTimes(1);
  });

  it("gives up when the provider is slow", async () => {
    const impl = ((_url: URL, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      })) as unknown as typeof fetch;
    const fetchSource = createSourceFetch(["api.example.com"], { impl, timeoutMs: 30 });
    await expect(fetchSource("https://api.example.com/")).rejects.toThrow("did not answer in time");
  });

  it("refuses an answer over the size limit, declared or not", async () => {
    const big = "x".repeat(200);
    const declared = createSourceFetch(["api.example.com"], {
      maxBytes: 100,
      impl: async () => new Response("{}", { headers: { "content-length": "5000" } }),
    });
    await expect(declared("https://api.example.com/")).rejects.toThrow("too large");
    const streamed = createSourceFetch(["api.example.com"], {
      maxBytes: 100,
      impl: async () => new Response(JSON.stringify({ big })),
    });
    await expect(streamed("https://api.example.com/")).rejects.toThrow("too large");
  });

  it("treats an answer that is not JSON as an empty body", async () => {
    const fetchSource = createSourceFetch(["api.example.com"], {
      impl: async () => new Response("<html>oops</html>", { status: 502 }),
    });
    expect(await fetchSource("https://api.example.com/")).toEqual({ status: 502, body: null });
  });

  it("reports a network failure without echoing the cause", async () => {
    const fetchSource = createSourceFetch(["api.example.com"], {
      impl: async () => {
        throw new Error("connect ECONNREFUSED secret-key-in-message");
      },
    });
    const error = await fetchSource("https://api.example.com/").catch((e: Error) => e);
    expect((error as Error).message).toBe("The provider could not be reached");
  });
});
