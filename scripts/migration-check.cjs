"use strict";

const assert = require("node:assert");
const {
  APP_SCHEMA_VERSION,
  migrateData,
  normalizeTasks,
  normalizePrefs,
  normalizeReminders,
  normalizeDailyReviews,
  normalizeQuests
} = require("../modules/migrations.js");

const legacy = {
  unknownRootField: { keep: true },
  tasks: {
    "2026-06-03": { "0": true, "1": 0, extra: "yes" },
    "2026-06-04": [true, false, 1]
  },
  prefs: { theme: "arasaka" },
  reminders: {
    leitura: { enabled: true, time: "21:30", customField: "keep" },
    custom: { name: "Custom", enabled: 1, message: "Ping" }
  },
  dailyReviews: {
    "2026-06-03": { note: "ok", custom: "keep" },
    "2026-06-04": "texto legado"
  },
  quests: {
    "2026-06-03": true,
    "2026-06-04": { idx: 2, custom: "keep" }
  }
};

const migrated = migrateData(legacy);

assert.equal(migrated.schemaVersion, APP_SCHEMA_VERSION);
assert.deepEqual(migrated.unknownRootField, legacy.unknownRootField);

assert.deepEqual(normalizeTasks(null), {});
assert.equal(migrated.tasks["2026-06-03"]["0"], true);
assert.equal(migrated.tasks["2026-06-03"]["1"], false);
assert.equal(migrated.tasks["2026-06-03"].extra, true);
assert.equal(migrated.tasks["2026-06-04"]["2"], true);

assert.equal(normalizePrefs({}).sound, true);
assert.equal(migrated.prefs.theme, "arasaka");
assert.equal(migrated.prefs.sound, true);
assert.equal(migrated.prefs.haptics, true);

assert.equal(normalizeReminders(null).leitura.enabled, false);
assert.equal(migrated.reminders.leitura.enabled, true);
assert.equal(migrated.reminders.leitura.customField, "keep");
assert.equal(migrated.reminders.custom.name, "Custom");

assert.deepEqual(normalizeDailyReviews(null), {});
assert.equal(migrated.dailyReviews["2026-06-03"].custom, "keep");
assert.equal(migrated.dailyReviews["2026-06-04"].note, "texto legado");

assert.deepEqual(normalizeQuests(null), {});
assert.deepEqual(migrated.quests["2026-06-03"], { value: true });
assert.equal(migrated.quests["2026-06-04"].custom, "keep");

console.log("Migration check OK");
