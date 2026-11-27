// Regression guard for the Home "unpriced usage" notice toggle.
//
// The banner lists models with recent usage but no configured price (#12341).
// It must stay ON unless the operator explicitly turns it off in Settings →
// Appearance (`showUnpricedUsageBannerOnHome === false`); an absent key (the
// common case for installs that never persisted the preference) must not hide
// the only warning that explains why per-key USD limits block unpriced models.
import { test } from "node:test";
import assert from "node:assert/strict";

import { shouldShowUnpricedUsageBannerOnHome } from "../../src/app/(dashboard)/dashboard/homeAppearance.ts";
import { updateSettingsSchema } from "../../src/shared/validation/settingsSchemas.ts";

test("absent setting shows the unpriced-usage banner (default ON)", () => {
  assert.equal(shouldShowUnpricedUsageBannerOnHome(undefined), true);
});

test("null keeps the default-on behavior instead of hiding the banner", () => {
  assert.equal(shouldShowUnpricedUsageBannerOnHome(null), true);
});

test("explicit false hides the unpriced-usage banner (Appearance opt-out)", () => {
  assert.equal(shouldShowUnpricedUsageBannerOnHome(false), false);
});

test("explicit true shows the unpriced-usage banner", () => {
  assert.equal(shouldShowUnpricedUsageBannerOnHome(true), true);
});

test("settings PATCH schema accepts showUnpricedUsageBannerOnHome", () => {
  const accepted = updateSettingsSchema.safeParse({ showUnpricedUsageBannerOnHome: false });
  assert.equal(accepted.success, true);
  if (!accepted.success) return;
  assert.equal(accepted.data.showUnpricedUsageBannerOnHome, false);

  const omitted = updateSettingsSchema.safeParse({});
  assert.equal(omitted.success, true);
  if (!omitted.success) return;
  assert.equal(omitted.data.showUnpricedUsageBannerOnHome, undefined);

  const rejected = updateSettingsSchema.safeParse({ showUnpricedUsageBannerOnHome: "no" });
  assert.equal(rejected.success, false);
});
