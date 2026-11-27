// tests/unit/chatcore-upstream-execute-headers.test.ts
// Characterization of buildUpstreamHeadersForExecute — the per-model upstream extra-header builder
// extracted from handleChatCore (chatCore god-file decomposition, #3501).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildUpstreamHeadersForExecute } from "../../open-sse/handlers/chatCore/upstreamExecuteHeaders.ts";
import { CPA_FORCE_FAST_MODE_HEADER } from "../../src/lib/providers/claudeFastMode.ts";

const base = {
  modelToCall: "some-model",
  effectiveModel: "some-model",
  provider: "openai",
  model: "some-model",
  resolvedModel: "some-model",
  sourceFormat: "openai",
  settings: {},
};

test("no custom UA / non-claude / no fast settings → no UA and no fast-mode header", () => {
  const h = buildUpstreamHeadersForExecute({ ...base });
  assert.equal(h["User-Agent"], undefined);
  assert.equal(h[CPA_FORCE_FAST_MODE_HEADER], undefined);
});

test("claude provider + enabled fast-mode settings + supported model → CPA header set", () => {
  const h = buildUpstreamHeadersForExecute({
    ...base,
    provider: "claude",
    modelToCall: "claude-fast-x",
    effectiveModel: "claude-fast-x",
    settings: { claudeFastMode: { enabled: true, supportedModels: ["claude-fast-x"] } },
  });
  assert.equal(h[CPA_FORCE_FAST_MODE_HEADER], "1");
});

test("fast-mode header is NOT set when the model is not in the supported list", () => {
  const h = buildUpstreamHeadersForExecute({
    ...base,
    provider: "claude",
    modelToCall: "claude-other",
    effectiveModel: "claude-other",
    settings: { claudeFastMode: { enabled: true, supportedModels: ["claude-fast-x"] } },
  });
  assert.equal(h[CPA_FORCE_FAST_MODE_HEADER], undefined);
});

test("fast-mode header is NOT set for non-claude providers even with fast settings", () => {
  const h = buildUpstreamHeadersForExecute({
    ...base,
    provider: "openai",
    modelToCall: "claude-fast-x",
    effectiveModel: "claude-fast-x",
    settings: { claudeFastMode: { enabled: true, supportedModels: ["claude-fast-x"] } },
  });
  assert.equal(h[CPA_FORCE_FAST_MODE_HEADER], undefined);
});

test("returns a plain object (no per-model extra headers configured for unknown models)", () => {
  const h = buildUpstreamHeadersForExecute({
    ...base,
    modelToCall: "totally-unknown",
    effectiveModel: "x",
  });
  assert.equal(typeof h, "object");
  assert.equal(h[CPA_FORCE_FAST_MODE_HEADER], undefined);
});
