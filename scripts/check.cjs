"use strict";

const fs = require("fs");
const { execFileSync } = require("child_process");

const files = [
  "index.html",
  "app-config.js",
  "modules/auth.js",
  "app.js",
  "style.css",
  "sw.js",
  "manifest.webmanifest"
];

for (const file of files) {
  if (!fs.existsSync(file)) throw new Error(`Arquivo ausente: ${file}`);
}

for (const file of ["app-config.js", "modules/auth.js", "app.js", "sw.js"]) {
  execFileSync("node", ["--check", file], { stdio: "inherit" });
}

JSON.parse(fs.readFileSync("manifest.webmanifest", "utf8"));

const html = fs.readFileSync("index.html", "utf8");
for (const asset of ["app-config.js", "modules/auth.js", "app.js", "style.css", "manifest.webmanifest"]) {
  if (!html.includes(asset)) throw new Error(`Asset nao referenciado no HTML: ${asset}`);
}

if (!/style\.css\?v=\d{8}-\d+/.test(html)) throw new Error("style.css precisa de cache-busting ?v=");
if (!/app\.js\?v=\d{8}-\d+/.test(html)) throw new Error("app.js precisa de cache-busting ?v=");
if (!/app-config\.js\?v=\d{8}-\d+/.test(html)) throw new Error("app-config.js precisa de cache-busting ?v=");
if (!/modules\/auth\.js\?v=\d{8}-\d+/.test(html)) throw new Error("modules/auth.js precisa de cache-busting ?v=");

const app = fs.readFileSync("app.js", "utf8");
const auth = fs.readFileSync("modules/auth.js", "utf8");
const securitySql = fs.existsSync("supabase/security-hardening.sql") ? fs.readFileSync("supabase/security-hardening.sql", "utf8") : "";
const pushSql = fs.existsSync("supabase/push-notifications.sql") ? fs.readFileSync("supabase/push-notifications.sql", "utf8") : "";
const scheduleSql = fs.existsSync("supabase/schedule-reminders.sql") ? fs.readFileSync("supabase/schedule-reminders.sql", "utf8") : "";
const edgeFn = fs.existsSync("supabase/functions/send-reminders/index.ts") ? fs.readFileSync("supabase/functions/send-reminders/index.ts", "utf8") : "";

if (!app.includes("AUTH_STORAGE_MODE")) throw new Error("Supabase Auth precisa usar storage configuravel");
if (!app.includes("sessionStorageArea")) throw new Error("Fallback nc_session_v2 precisa usar sessionStorage");
if (!auth.includes("authSessionStore()")) throw new Error("Dados temporarios de Auth precisam usar sessionStorage");
if (!auth.includes("pendingSignupMessage")) throw new Error("Fluxo de criacao precisa bloquear reenvio de confirmacao");
if (!securitySql.includes("push_delivery_log_own_select")) throw new Error("security-hardening.sql precisa de politica para push_delivery_log");
if (!pushSql.includes("push_delivery_log_own_select")) throw new Error("push-notifications.sql precisa de politica para push_delivery_log");
if (!scheduleSql.includes("x-night-city-cron")) throw new Error("schedule-reminders.sql precisa enviar x-night-city-cron");
if (!edgeFn.includes("SEND_REMINDERS_SECRET is required")) throw new Error("send-reminders precisa exigir SEND_REMINDERS_SECRET");

const securityDebt = {
  inlineHandlers: (html + app).match(/\son(?:click|input|change|keydown)=/g)?.length || 0,
  innerHTML: app.match(/innerHTML/g)?.length || 0,
  unsafeInline: html.match(/unsafe-inline/g)?.length || 0
};

console.log(`Security debt tracked: inlineHandlers=${securityDebt.inlineHandlers}, innerHTML=${securityDebt.innerHTML}, unsafeInline=${securityDebt.unsafeInline}`);
console.log("Night City check OK");
