import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// DefaultExecutor transitively touches the DB layer (provider/key rotation
// lookups) at import/call time. Point DATA_DIR at an isolated temp dir
// BEFORE importing it so these tests never read/write the operator's real
// ~/.omniroute database (see CLAUDE.md "Database Handles in Tests").
const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "omniroute-client-identity-"));
process.env.DATA_DIR = TEST_DATA_DIR;

import {
  getProviderUserAgent,
  readProviderUserAgentSetting,
} from "../../src/shared/constants/providerUserAgentPresets.ts";
import { isForbiddenCustomHeaderName } from "../../src/shared/constants/upstreamHeaders.ts";
const { DefaultExecutor } = await import("../../open-sse/executors/default.ts");
const core = await import("../../src/lib/db/core.ts");

test.after(async () => {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test("a malicious profile-shaped header set has its auth/cookie entries dropped by applyCustomHeaders", () => {
  const executor = new DefaultExecutor("openai-compatible-test");

  // Simulate a compromised/hand-crafted profile that tries to smuggle in
  // credential-owning header names alongside a legitimate identity header.
  // isForbiddenCustomHeaderName is the single source of truth used by both
  // the Zod schema and the executor, so assert against it directly too.
  const maliciousProfileHeaders: Record<string, string> = {
    "User-Agent": "totally-legit-cli/1.0",
    Authorization: "Bearer stolen-token",
    "x-api-key": "stolen-key",
    cookie: "session=stolen",
  };
  assert.equal(isForbiddenCustomHeaderName("Authorization"), true);
  assert.equal(isForbiddenCustomHeaderName("x-api-key"), true);
  assert.equal(isForbiddenCustomHeaderName("cookie"), true);

  const headers = executor.buildHeaders(
    {
      apiKey: "real-key",
      providerSpecificData: {
        baseUrl: "https://proxy.example.com/v1",
        customHeaders: maliciousProfileHeaders,
      },
    },
    true
  ) as Record<string, string>;

  assert.equal(headers["User-Agent"], "totally-legit-cli/1.0");
  assert.equal(headers["Authorization"], "Bearer real-key");
  assert.notEqual(headers["Authorization"], "Bearer stolen-token");
  assert.equal(headers["x-api-key"], undefined);
  assert.equal(headers["cookie"], undefined);
});

test("a provider preset overrides the incoming User-Agent without adding other identity headers", async () => {
  const executor = new DefaultExecutor("openai-compatible-test");
  const originalFetch = globalThis.fetch;
  let capturedHeaders: Record<string, string> = {};

  globalThis.fetch = async (_url: string | URL | Request, init: RequestInit = {}) => {
    capturedHeaders = (init.headers as Record<string, string>) || {};
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    await executor.execute({
      model: "gpt-4.1",
      body: { messages: [{ role: "user", content: "hi" }] },
      stream: false,
      clientHeaders: { "user-agent": "client/1.0" },
      credentials: {
        apiKey: "real-key",
        providerSpecificData: {
          baseUrl: "https://test.proxy.com/v1",
          customHeaders: {
            "User-Agent": getProviderUserAgent({
              ...readProviderUserAgentSetting(),
              enabled: true,
              preset: "omp",
            }),
          },
        },
      },
    });

    assert.equal(capturedHeaders["User-Agent"], "omp/19.2.1");
    assert.equal(capturedHeaders.originator, undefined);
    assert.equal(capturedHeaders["Authorization"], "Bearer real-key");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
