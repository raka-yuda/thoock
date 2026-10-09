import { afterEach, describe, expect, it, vi } from "vitest";
import {
  appLogger,
  getRequestLogContext,
  sanitizeLogData,
  withApiLogging,
} from "./logger";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("server logger", () => {
  it("redacts secrets and binary payloads", () => {
    vi.stubEnv("OPENAI_API_KEY", "secret-key-value");
    expect(
      sanitizeLogData({
        authorization: "Bearer hidden",
        prompt: "safe",
        message: "failed with secret-key-value",
        buffer: Buffer.from("image"),
      }),
    ).toEqual({
      authorization: "[REDACTED]",
      prompt: "safe",
      message: "failed with [REDACTED]",
      buffer: { binaryData: "[NOT LOGGED]", byteLength: 5 },
    });
  });

  it("preserves a sanitized database cause for wrapped errors", () => {
    const databaseError = Object.assign(new Error("value too long"), {
      code: "22001",
      column: "copy_space_location",
    });
    const wrappedError = new Error("Failed query", { cause: databaseError });

    expect(sanitizeLogData(wrappedError)).toMatchObject({
      name: "Error",
      message: "Failed query",
      cause: {
        name: "Error",
        message: "value too long",
        code: "22001",
        column: "copy_space_location",
      },
    });
  });

  it("logs the API lifecycle and propagates a request id", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const handler = withApiLogging(async (request: Request) => {
      void request;
      appLogger.info("api.work.started", { action: "research" });
      expect(getRequestLogContext()?.requestId).toBe("request-123");
      return Response.json({ ok: true });
    });

    const response = await handler(
      new Request("http://localhost/api/research/topics?q=stock", {
        method: "POST",
        headers: { "x-request-id": "request-123" },
      }),
    );

    expect(response.headers.get("x-request-id")).toBe("request-123");
    const entries = info.mock.calls.map(([entry]) => JSON.parse(String(entry)));
    expect(entries.map((entry) => entry.event)).toEqual([
      "api.request.started",
      "api.work.started",
      "api.request.completed",
    ]);
    expect(entries[2]).toMatchObject({
      requestId: "request-123",
      method: "POST",
      path: "/api/research/topics",
      status: 200,
    });
  });

  it("uses warning logs for client errors", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const handler = withApiLogging(async (request: Request) => {
      void request;
      return Response.json({ error: "Invalid" }, { status: 400 });
    });

    await handler(new Request("http://localhost/api/example"));

    expect(JSON.parse(String(warn.mock.calls[0][0]))).toMatchObject({
      event: "api.request.completed",
      status: 400,
    });
  });
});
