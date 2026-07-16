import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, isAuthRequiredError, AUTH_REQUIRED_MESSAGE } from "../api";

async function loadApiModule() {
  vi.resetModules();
  return import("../api");
}

async function loadApiAndGetTicker() {
  vi.resetModules();
  const mod = await import("../api");
  return mod.getTicker;
}

function mockFetch(status: number, body: unknown, headers?: Record<string, string>) {
  const isJson = typeof body === "object" && !(body instanceof Response);
  const res = new Response(isJson ? JSON.stringify(body) : (body as BodyInit), {
    status,
    headers: { "content-type": isJson ? "application/json" : "text/html", ...headers },
  });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res));
}

function mockAuth(token: string | null) {
  const store: Record<string, string> = {};
  if (token) store["vibe_trading_api_auth_key"] = token;
  vi.stubGlobal("localStorage", {
    getItem: vi.fn((k: string) => store[k] ?? null),
    setItem: vi.fn((k: string, v: string) => { store[k] = v; }),
    removeItem: vi.fn((k: string) => { delete store[k]; }),
  });
}

describe("ApiError", () => {
  it("sets name and status", () => {
    const err = new ApiError("not found", 404);
    expect(err.name).toBe("ApiError");
    expect(err.status).toBe(404);
    expect(err.message).toBe("not found");
  });
});

describe("isAuthRequiredError", () => {
  it("returns true for 401", () => {
    expect(isAuthRequiredError(new ApiError("x", 401))).toBe(true);
  });
  it("returns true for 403", () => {
    expect(isAuthRequiredError(new ApiError("x", 403))).toBe(true);
  });
  it("returns false for other statuses", () => {
    expect(isAuthRequiredError(new ApiError("x", 404))).toBe(false);
    expect(isAuthRequiredError(new ApiError("x", 500))).toBe(false);
  });
  it("returns false for non-ApiError", () => {
    expect(isAuthRequiredError(new Error("x"))).toBe(false);
  });
});

describe("api request helper", () => {
  beforeEach(() => {
    mockAuth(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  describe("error handling", () => {
    it("rejects non-JSON responses with a descriptive error", async () => {
      mockFetch(200, "<html></html>");

      const { api } = await loadApiModule();

      await expect(api.getChannelStatus()).rejects.toMatchObject({
        name: "ApiError",
        status: 200,
        message: expect.stringContaining("Expected JSON from /channels/status, got text/html"),
      });
    });

    it("includes detail from JSON error body", async () => {
      mockFetch(400, { detail: "Bad request detail" });

      const { api } = await loadApiModule();

      await expect(api.listSessions()).rejects.toMatchObject({
        status: 400,
        message: "Bad request detail",
      });
    });

    it("uses status text when JSON body has no detail", async () => {
      mockFetch(502, { nope: true });

      const { api } = await loadApiModule();

      await expect(api.listSessions()).rejects.toMatchObject({
        status: 502,
        message: expect.stringContaining("502"),
      });
    });

    it("replaces detail with auth message on 401", async () => {
      mockFetch(401, { detail: "unauthorized" });

      const { api } = await loadApiModule();

      await expect(api.listSessions()).rejects.toMatchObject({
        status: 401,
        message: AUTH_REQUIRED_MESSAGE,
      });
    });

    it("replaces detail with auth message on 403", async () => {
      mockFetch(403, { detail: "forbidden" });

      const { api } = await loadApiModule();

      await expect(api.listSessions()).rejects.toMatchObject({
        status: 403,
        message: AUTH_REQUIRED_MESSAGE,
      });
    });
  });

  describe("auth headers", () => {
    it("sends auth header when token is set", async () => {
      mockAuth("my-token");
      mockFetch(200, [{ session_id: "s1", title: "T", created_at: "", updated_at: "", message_count: 0 }]);

      const { api } = await loadApiModule();
      await api.listSessions();

      const fetchCall = vi.mocked(fetch).mock.calls[0];
      const headers = (fetchCall[1] as RequestInit).headers as Record<string, string>;
      expect(headers["Authorization"]).toBe("Bearer my-token");
    });

    it("sends no auth header when token is empty", async () => {
      mockFetch(200, []);

      const { api } = await loadApiModule();
      await api.listSessions();

      const fetchCall = vi.mocked(fetch).mock.calls[0];
      const headers = (fetchCall[1] as RequestInit).headers as Record<string, string>;
      expect(headers["Authorization"]).toBeUndefined();
    });
  });

  describe("endpoints", () => {
    it("listSessions returns session list #1", async () => {
      const sessions = [{ session_id: "s1", title: "Test", created_at: "", updated_at: "", message_count: 0 }];
      mockFetch(200, sessions);

      const { api } = await loadApiModule();
      const result = await api.listSessions();

      expect(result).toEqual(sessions);
    });

    it("creates a session", async () => {
      mockFetch(200, { session_id: "s1", title: "New", created_at: "", updated_at: "", message_count: 0 });

      const { api } = await loadApiModule();
      const result = await api.createSession("New");

      expect(result.session_id).toBe("s1");
    });

    it("deletes a session", async () => {
      mockFetch(200, { status: "ok" });

      const { api } = await loadApiModule();
      const result = await api.deleteSession("s1");

      expect(result.status).toBe("ok");
    });

    it("renames a session", async () => {
      mockFetch(200, { status: "ok" });

      const { api } = await loadApiModule();
      const result = await api.renameSession("s1", "Renamed");

      expect(result.status).toBe("ok");
    });

    it("sends a message", async () => {
      mockFetch(200, { message_id: "m1", attempt_id: "a1" });

      const { api } = await loadApiModule();
      const result = await api.sendMessage("s1", "hello");

      expect(result.message_id).toBe("m1");
      expect(result.attempt_id).toBe("a1");
    });

    it("cancels a session", async () => {
      mockFetch(200, { status: "ok" });

      const { api } = await loadApiModule();
      const result = await api.cancelSession("s1");

      expect(result.status).toBe("ok");
    });

    it("gets session messages", async () => {
      const msgs = [{ message_id: "m1", session_id: "s1", role: "user", content: "hi", created_at: "" }];
      mockFetch(200, msgs);

      const { api } = await loadApiModule();
      const result = await api.getSessionMessages("s1");

      expect(result).toEqual(msgs);
    });

    it("lists runs", async () => {
      mockFetch(200, []);

      const { api } = await loadApiModule();
      const result = await api.listRuns();

      expect(result).toEqual([]);
    });

    it("lists runs with limit", async () => {
      mockFetch(200, []);

      const { api } = await loadApiModule();
      await api.listRuns(10);

      const url = vi.mocked(fetch).mock.calls[0][0] as string;
      expect(url).toContain("limit=10");
    });

    it("gets a run", async () => {
      const run = { run_id: "r1", status: "completed" };
      mockFetch(200, run);

      const { api } = await loadApiModule();
      const result = await api.getRun("r1");

      expect(result).toMatchObject({ run_id: "r1" });
    });

    it("gets run code", async () => {
      mockFetch(200, { "main.py": "print('hello')" });

      const { api } = await loadApiModule();
      const result = await api.getRunCode("r1");

      expect(result["main.py"]).toBe("print('hello')");
    });

    it("gets run pine script", async () => {
      mockFetch(200, { pine: "//@version=5", success: true });

      const { api } = await loadApiModule();
      const result = await api.getRunPine("r1");

      expect(result.success).toBe(true);
    });

    it("gets channel status", async () => {
      mockFetch(200, { channels: [] });

      const { api } = await loadApiModule();
      const result = await api.getChannelStatus();

      expect(result).toEqual({ channels: [] });
    });

    it("gets live status", async () => {
      mockFetch(200, { brokers: [], global_halted: false });

      const { api } = await loadApiModule();
      const result = await api.getLiveStatus();

      expect(result.global_halted).toBe(false);
    });

    it("gets LLM settings", async () => {
      mockFetch(200, { provider: "openai", model: "gpt-4" });

      const { api } = await loadApiModule();
      const result = await api.getLLMSettings();

      expect(result.provider).toBe("openai");
    });

    it("updates LLM settings", async () => {
      mockFetch(200, { provider: "anthropic", model: "claude-3" });

      const { api } = await loadApiModule();
      const result = await api.updateLLMSettings({ provider: "anthropic", model: "claude-3" });

      expect(result.provider).toBe("anthropic");
    });

    it("gets market ticker as top-level function", async () => {
      const ticker = [{ symbol: "AAPL", price: "150", change: "+1", pct: "0.67", dir: "up" as const }];
      mockFetch(200, ticker);

      const getTickerFn = await loadApiAndGetTicker();
      const result = await getTickerFn();

      expect(result).toEqual(ticker);
    });

    it("lists swarm runs", async () => {
      mockFetch(200, [{ id: "sr1", status: "completed", preset_name: "test" }]);

      const { api } = await loadApiModule();
      const result = await api.listSwarmRuns();

      expect(result[0].id).toBe("sr1");
    });

    it("gets goal for session", async () => {
      mockFetch(200, { goal: "test goal", progress: [] });

      const { api } = await loadApiModule();
      const result = await api.getGoal("s1");

      expect(result.goal).toBe("test goal");
    });

    it("creates goal for session", async () => {
      mockFetch(200, { goal: "new goal", progress: [] });

      const { api } = await loadApiModule();
      const result = await api.createGoal("s1", { goal: "new goal", motivation: "testing" });

      expect(result.goal).toBe("new goal");
    });

    it("handles empty response body", async () => {
      const res = new Response("", { status: 200, headers: { "content-type": "application/json" } });
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res));

      const { api } = await loadApiModule();
      const result = await api.getChannelStatus();

      expect(result).toEqual({});
    });

    it("GET passes Content-Type header", async () => {
      mockFetch(200, { status: "ok" });

      const { api } = await loadApiModule();
      await api.listSessions();

      const fetchCall = vi.mocked(fetch).mock.calls[0];
      const headers = (fetchCall[1] as RequestInit).headers as Record<string, string>;
      expect(headers["Content-Type"]).toBe("application/json");
    });

    it("POST sends JSON body", async () => {
      mockFetch(200, { session_id: "s1", title: "T", created_at: "", updated_at: "", message_count: 0 });

      const { api } = await loadApiModule();
      await api.createSession("Hello World");

      const fetchCall = vi.mocked(fetch).mock.calls[0];
      const body = JSON.parse((fetchCall[1] as RequestInit).body as string);
      expect(body.title).toBe("Hello World");
    });
  });
});
