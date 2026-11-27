import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";

test("provider scope migration preserves retained credentials and history", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`
      CREATE TABLE provider_nodes (id TEXT PRIMARY KEY, name TEXT);
      CREATE TABLE provider_connections (id TEXT PRIMARY KEY, provider TEXT, api_key TEXT);
      CREATE TABLE key_value (namespace TEXT, key TEXT, value TEXT);
      CREATE TABLE discovery_results (provider_id TEXT);
      CREATE TABLE seen_models (provider TEXT);
      CREATE TABLE provider_key_limits (provider TEXT);
      CREATE TABLE registered_keys (provider TEXT);
      CREATE TABLE usage_history (provider TEXT);
      INSERT INTO provider_nodes VALUES ('custom-thb', 'tokenharbor'), ('custom-other', 'Other');
      INSERT INTO provider_connections VALUES
        ('thb-key', 'custom-thb', 'enc:v1:retained'),
        ('codex-key', 'codex', 'enc:v1:codex'),
        ('gemini-key', 'gemini-web', 'enc:v1:gemini'),
        ('deepseek-key', 'deepseek-web', 'enc:v1:deepseek'),
        ('removed-key', 'cloudflare-playground', 'removed'),
        ('other-key', 'custom-other', 'removed');
      INSERT INTO key_value VALUES
        ('syncedAvailableModels', 'custom-thb:thb-key', '["live-model"]'),
        ('syncedAvailableModels', 'cloudflare-playground:removed-key', '["retired-model"]'),
        ('customModels', 'custom-thb', '["custom-model"]'),
        ('customModels', 'cloudflare-playground', '["retired-model"]'),
        ('settings', 'theme', 'dark');
      INSERT INTO usage_history VALUES ('cloudflare-playground');
      INSERT INTO registered_keys VALUES ('');
    `);
    db.exec(
      fs.readFileSync(
        new URL(
          "../../../src/lib/db/migrations/242_lightroute_provider_scope.sql",
          import.meta.url
        ),
        "utf8"
      )
    );
    const rows = (sql: string) =>
      db
        .prepare(sql)
        .all()
        .map((row) => ({ ...row }));
    assert.deepEqual(rows("SELECT id, api_key FROM provider_connections ORDER BY id"), [
      { id: "codex-key", api_key: "enc:v1:codex" },
      { id: "deepseek-key", api_key: "enc:v1:deepseek" },
      { id: "gemini-key", api_key: "enc:v1:gemini" },
      { id: "thb-key", api_key: "enc:v1:retained" },
    ]);
    assert.deepEqual(rows("SELECT id FROM provider_nodes"), [{ id: "custom-thb" }]);
    assert.deepEqual(rows("SELECT namespace, key, value FROM key_value ORDER BY namespace"), [
      { namespace: "customModels", key: "custom-thb", value: '["custom-model"]' },
      { namespace: "settings", key: "theme", value: "dark" },
      { namespace: "syncedAvailableModels", key: "custom-thb:thb-key", value: '["live-model"]' },
    ]);
    assert.deepEqual(rows("SELECT provider FROM usage_history"), [
      { provider: "cloudflare-playground" },
    ]);
    assert.deepEqual(rows("SELECT provider FROM registered_keys"), [{ provider: "" }]);
  } finally {
    db.close();
  }
});
