CREATE TEMP TABLE lightroute_kept_providers (id TEXT PRIMARY KEY);

INSERT INTO lightroute_kept_providers (id) VALUES
  ('antigravity'), ('codex'), ('kiro'), ('agentrouter'),
  ('opencode-go'), ('gemini-web'), ('deepseek-web');

INSERT OR IGNORE INTO lightroute_kept_providers (id)
SELECT id FROM provider_nodes
WHERE lower(trim(name)) IN
  ('artbloom', 'budsai', 'cn', 'coarena', 'freegg', 'fujcloud', 'numes', 'tokenharbor');

DELETE FROM key_value
WHERE namespace IN ('syncedAvailableModels', 'discoveryState')
  AND instr(key, ':') > 0
  AND substr(key, 1, instr(key, ':') - 1) NOT IN
    (SELECT id FROM lightroute_kept_providers);

DELETE FROM key_value
WHERE namespace IN ('customModels', 'modelCompatOverrides', 'providerAliases')
  AND key NOT IN (SELECT id FROM lightroute_kept_providers);

DELETE FROM discovery_results
WHERE provider_id NOT IN (SELECT id FROM lightroute_kept_providers);

DELETE FROM seen_models
WHERE provider NOT IN (SELECT id FROM lightroute_kept_providers);

DELETE FROM provider_key_limits
WHERE provider <> '' AND provider NOT IN (SELECT id FROM lightroute_kept_providers);

DELETE FROM registered_keys
WHERE provider <> '' AND provider NOT IN (SELECT id FROM lightroute_kept_providers);

DELETE FROM provider_connections
WHERE provider NOT IN (SELECT id FROM lightroute_kept_providers);

DELETE FROM provider_nodes
WHERE id NOT IN (SELECT id FROM lightroute_kept_providers);

DROP TABLE lightroute_kept_providers;
