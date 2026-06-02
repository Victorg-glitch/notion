"use strict";

const fs = require("fs");
const { execFileSync } = require("child_process");

const files = [
  "index.html",
  "app-config.js",
  "app.js",
  "style.css",
  "sw.js",
  "manifest.webmanifest"
];

for (const file of files) {
  if (!fs.existsSync(file)) throw new Error(`Arquivo ausente: ${file}`);
}

for (const file of ["app-config.js", "app.js", "sw.js"]) {
  execFileSync("node", ["--check", file], { stdio: "inherit" });
}

JSON.parse(fs.readFileSync("manifest.webmanifest", "utf8"));

const html = fs.readFileSync("index.html", "utf8");
for (const asset of ["app-config.js", "app.js", "style.css", "manifest.webmanifest"]) {
  if (!html.includes(asset)) throw new Error(`Asset nao referenciado no HTML: ${asset}`);
}

if (!/style\.css\?v=\d{8}-\d+/.test(html)) throw new Error("style.css precisa de cache-busting ?v=");
if (!/app\.js\?v=\d{8}-\d+/.test(html)) throw new Error("app.js precisa de cache-busting ?v=");
if (!/app-config\.js\?v=\d{8}-\d+/.test(html)) throw new Error("app-config.js precisa de cache-busting ?v=");

console.log("Night City check OK");
