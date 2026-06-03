"use strict";

const fs = require("fs");
const { execFileSync } = require("child_process");

function runSilentCheck(command, args) {
  try {
    execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    if (error.stdout) process.stderr.write(error.stdout);
    if (error.stderr) process.stderr.write(error.stderr);
    throw error;
  }
}

const files = [
  "index.html",
  "app-config.js",
  "modules/state.js",
  "modules/security.js",
  "modules/auth.js",
  "modules/ui.js",
  "modules/migrations.js",
  "modules/routines.js",
  "modules/notifications.js",
  "modules/storage.js",
  "modules/gamification.js",
  "modules/events.js",
  "app.js",
  "style.css",
  "sw.js",
  "manifest.webmanifest"
];

for (const file of files) {
  if (!fs.existsSync(file)) throw new Error(`Arquivo ausente: ${file}`);
}

for (const file of ["app-config.js", "modules/state.js", "modules/security.js", "modules/auth.js", "modules/ui.js", "modules/migrations.js", "modules/routines.js", "modules/notifications.js", "modules/storage.js", "modules/gamification.js", "modules/events.js", "app.js", "sw.js", "scripts/migration-check.cjs"]) {
  runSilentCheck("node", ["--check", file]);
}
runSilentCheck("node", ["scripts/flow-check.cjs"]);
runSilentCheck("node", ["scripts/migration-check.cjs"]);

JSON.parse(fs.readFileSync("manifest.webmanifest", "utf8"));

const html = fs.readFileSync("index.html", "utf8");
for (const asset of ["app-config.js", "modules/state.js", "modules/security.js", "modules/auth.js", "modules/ui.js", "modules/migrations.js", "modules/routines.js", "modules/notifications.js", "modules/storage.js", "modules/gamification.js", "modules/events.js", "app.js", "style.css", "manifest.webmanifest"]) {
  if (!html.includes(asset)) throw new Error(`Asset nao referenciado no HTML: ${asset}`);
}

if (!/style\.css\?v=\d{8}-\d+/.test(html)) throw new Error("style.css precisa de cache-busting ?v=");
if (!/app\.js\?v=\d{8}-\d+/.test(html)) throw new Error("app.js precisa de cache-busting ?v=");
if (!/app-config\.js\?v=\d{8}-\d+/.test(html)) throw new Error("app-config.js precisa de cache-busting ?v=");
if (!/modules\/state\.js\?v=\d{8}-\d+/.test(html)) throw new Error("modules/state.js precisa de cache-busting ?v=");
if (!/modules\/security\.js\?v=\d{8}-\d+/.test(html)) throw new Error("modules/security.js precisa de cache-busting ?v=");
if (!/modules\/auth\.js\?v=\d{8}-\d+/.test(html)) throw new Error("modules/auth.js precisa de cache-busting ?v=");
if (!/modules\/ui\.js\?v=\d{8}-\d+/.test(html)) throw new Error("modules/ui.js precisa de cache-busting ?v=");
if (!/modules\/migrations\.js\?v=\d{8}-\d+/.test(html)) throw new Error("modules/migrations.js precisa de cache-busting ?v=");
if (!/modules\/routines\.js\?v=\d{8}-\d+/.test(html)) throw new Error("modules/routines.js precisa de cache-busting ?v=");
if (!/modules\/notifications\.js\?v=\d{8}-\d+/.test(html)) throw new Error("modules/notifications.js precisa de cache-busting ?v=");
if (!/modules\/storage\.js\?v=\d{8}-\d+/.test(html)) throw new Error("modules/storage.js precisa de cache-busting ?v=");
if (!/modules\/gamification\.js\?v=\d{8}-\d+/.test(html)) throw new Error("modules/gamification.js precisa de cache-busting ?v=");
if (!/modules\/events\.js\?v=\d{8}-\d+/.test(html)) throw new Error("modules/events.js precisa de cache-busting ?v=");
if (html.indexOf("modules/gamification.js") > html.indexOf("app.js?v=")) throw new Error("modules/gamification.js precisa carregar antes de app.js");
if (/\son(?:click|input|change|keydown|dblclick|submit)=/.test(html)) throw new Error("index.html nao deve usar handlers inline; use modules/events.js");
if (/script-src[^;]*unsafe-inline/.test(html)) throw new Error("script-src nao deve permitir unsafe-inline");

const app = fs.readFileSync("app.js", "utf8");
const moduleCode = ["modules/state.js", "modules/security.js", "modules/ui.js", "modules/migrations.js", "modules/routines.js", "modules/notifications.js", "modules/storage.js", "modules/gamification.js", "modules/events.js"].map(file => fs.readFileSync(file, "utf8")).join("\n");
const gamification = fs.readFileSync("modules/gamification.js", "utf8");
const appCode = app + "\n" + moduleCode;
const auth = fs.readFileSync("modules/auth.js", "utf8");
const securitySql = fs.existsSync("supabase/security-hardening.sql") ? fs.readFileSync("supabase/security-hardening.sql", "utf8") : "";
const pushSql = fs.existsSync("supabase/push-notifications.sql") ? fs.readFileSync("supabase/push-notifications.sql", "utf8") : "";
const scheduleSql = fs.existsSync("supabase/schedule-reminders.sql") ? fs.readFileSync("supabase/schedule-reminders.sql", "utf8") : "";
const edgeFn = fs.existsSync("supabase/functions/send-reminders/index.ts") ? fs.readFileSync("supabase/functions/send-reminders/index.ts", "utf8") : "";

if (!appCode.includes("AUTH_STORAGE_MODE")) throw new Error("Supabase Auth precisa usar storage configuravel");
if (!appCode.includes("SAVE_KEYS")) throw new Error("SAVE_KEYS precisa estar disponivel no modulo de estado");
if (!appCode.includes("htmlEscape")) throw new Error("htmlEscape precisa estar disponivel no modulo de seguranca");
if (!appCode.includes("jsString")) throw new Error("jsString precisa estar disponivel no modulo de seguranca");
if (!appCode.includes("localDateKey")) throw new Error("Helpers de data local precisam estar no modulo de estado");
if (!appCode.includes("validateBackupPayload")) throw new Error("Importacao de backup precisa validar schema");
if (!appCode.includes("confirmBackupImport")) throw new Error("Importacao de backup precisa de confirmacao apos preview");
if (!appCode.includes("BACKUP_MAX_BYTES")) throw new Error("Importacao de backup precisa validar tamanho maximo");
if (!appCode.includes("sessionStorageArea")) throw new Error("Fallback nc_session_v2 precisa usar sessionStorage");
if (!appCode.includes("bindUiEvents")) throw new Error("Eventos UI precisam ser centralizados em bindUiEvents");
if (!appCode.includes("migrateData")) throw new Error("Dados precisam passar por migrateData");
if (!appCode.includes("schemaVersion")) throw new Error("Dados precisam ter schemaVersion");
for (const fn of ["ensureRetentionData", "awardEddies", "renderShop", "renderSeasonBanner", "streetCredScore"]) {
  if (!new RegExp(`function\\s+${fn}\\s*\\(`).test(gamification)) {
    throw new Error(`modules/gamification.js precisa manter ${fn} disponivel`);
  }
}
if (!auth.includes("authSessionStore()")) throw new Error("Dados temporarios de Auth precisam usar sessionStorage");
if (!auth.includes("pendingSignupMessage")) throw new Error("Fluxo de criacao precisa bloquear reenvio de confirmacao");
if (!securitySql.includes("push_delivery_log_own_select")) throw new Error("security-hardening.sql precisa de politica para push_delivery_log");
if (!securitySql.includes("friend_profile_directory")) throw new Error("security-hardening.sql precisa expor busca publica limitada de perfis");
if (!securitySql.includes("friend_profile_can_view_details")) throw new Error("security-hardening.sql precisa limitar detalhes de perfil do Commlink");
if (/create policy "friend_profiles_read_authenticated"[\s\S]*?using \(true\)/.test(securitySql)) throw new Error("friend_profiles nao pode usar leitura autenticada aberta");
if (!pushSql.includes("push_delivery_log_own_select")) throw new Error("push-notifications.sql precisa de politica para push_delivery_log");
if (!scheduleSql.includes("x-night-city-cron")) throw new Error("schedule-reminders.sql precisa enviar x-night-city-cron");
if (!edgeFn.includes("SEND_REMINDERS_SECRET is required")) throw new Error("send-reminders precisa exigir SEND_REMINDERS_SECRET");

const securityDebt = {
  inlineHandlers: (html + appCode).match(/\son(?:click|input|change|keydown|dblclick|submit)=/g)?.length || 0,
  onclickAssignments: appCode.match(/\.onclick\s*=/g)?.length || 0,
  innerHTML: appCode.match(/innerHTML/g)?.length || 0,
  unsafeInline: html.match(/script-src[^;]*unsafe-inline/g)?.length || 0
};

if (securityDebt.inlineHandlers !== 0) throw new Error(`Handlers inline restantes: ${securityDebt.inlineHandlers}`);
if (securityDebt.onclickAssignments !== 0) throw new Error(`Atribuicoes .onclick restantes: ${securityDebt.onclickAssignments}`);
if (securityDebt.unsafeInline !== 0) throw new Error("script-src ainda permite unsafe-inline");

console.log("Night City check OK");
