"use strict";

const fs = require("fs");

const html = fs.readFileSync("index.html", "utf8");
const app = fs.readFileSync("app.js", "utf8");
const css = fs.readFileSync("style.css", "utf8");

const requiredHtml = [
  "setup-wizard",
  "daily-review",
  "contract-modal",
  "daily-command",
  "setup-focus",
  "setup-autopilot",
  "contract-mode-quick",
  "s-cred",
  "home-top-streak",
  "notify-last-test",
  "notify-push-endpoint"
];

const requiredApp = [
  "openSetupWizard",
  "saveSetupWizard",
  "openDailyReview",
  "saveDailyReview",
  "openContractModal",
  "saveContractModal",
  "archiveTask",
  "autoBuildRoutine",
  "autoBuildFromHome",
  "quickRoutineConfig",
  "seedFirstDailyReview",
  "streetCredScore",
  "topStreakInfo",
  "setContractMode",
  "startFriendRealtime",
  "stopFriendRealtime",
  "activityHistory",
  "dailyReviews",
  "evolutionHistoryHtml",
  "renderNotificationDiagnostics"
];

const requiredCss = [
  ".daily-command",
  ".quick-setup",
  ".smart-empty",
  ".contract-mode-tabs",
  ".page-lore",
  ".setup-wizard",
  ".daily-review",
  ".contract-modal",
  ".evolution-row",
  ".custom-next-step"
];

for (const item of requiredHtml) {
  if (!html.includes(item)) throw new Error(`Fluxo ausente no HTML: ${item}`);
}

for (const item of requiredApp) {
  if (!app.includes(item)) throw new Error(`Fluxo ausente no app.js: ${item}`);
}

for (const item of requiredCss) {
  if (!css.includes(item)) throw new Error(`Estilo ausente no CSS: ${item}`);
}

if (!/resolveFriendLookup\(value\)[\s\S]*#\(01\|\\d\{4\}\)/.test(app)) {
  throw new Error("Commlink deve aceitar #01 ou tags de 4 digitos");
}

console.log("Night City flow check OK");
