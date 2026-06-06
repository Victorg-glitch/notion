'use strict';
// Auditoria completa do Night City Life System.
// Uso: AUDIT_EMAIL=... AUDIT_PASSWORD=... npm run audit
// Saída: reports/audit.html + reports/audit-*.png

const { chromium } = require('playwright-core');
const lighthouse = require('lighthouse');
const fs = require('fs');
const path = require('path');

const CONFIG = {
  url: 'https://victorg-glitch.github.io/notion/',
  email: process.env.AUDIT_EMAIL || '',
  password: process.env.AUDIT_PASSWORD || '',
  outputDir: path.join(__dirname, '..', 'reports'),
  timeout: 30000,
};

const SECTIONS = [
  { name: 'Login',        action: null,       waitFor: 'input[type="email"], #email' },
  { name: 'Modo Hoje',    action: 'modo-hoje', waitFor: '.tm-status-line, #page-home' },
  { name: 'Contratos',    action: 'contratos', waitFor: '#page-tasks, .task-list' },
  { name: 'Modo Foco',    action: 'modo-foco', waitFor: '#mission-focus, .mission-focus' },
  { name: 'Distritos',    action: 'distritos', waitFor: '#page-districts, .district-list' },
  { name: 'Leitura',      action: 'leitura',   waitFor: '#page-books' },
  { name: 'Dev',          action: 'dev',        waitFor: '#page-dev' },
  { name: 'Configuracao', action: 'sistema',    waitFor: '#page-notificacoes, .settings-center' },
];

function ensureOutputDir() {
  if (!fs.existsSync(CONFIG.outputDir)) fs.mkdirSync(CONFIG.outputDir, { recursive: true });
}

function formatScore(score) {
  if (score === null || score === undefined) return '—';
  const pct = Math.round(score * 100);
  if (pct >= 90) return `✅ ${pct}`;
  if (pct >= 50) return `⚠️  ${pct}`;
  return `❌ ${pct}`;
}

function formatMs(ms) {
  if (!ms) return '—';
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

async function doLogin(page) {
  console.log('  → Abrindo app...');
  await page.goto(CONFIG.url, { waitUntil: 'networkidle', timeout: CONFIG.timeout });
  await page.waitForSelector('input[type="email"], #email, input[name="email"]', { timeout: CONFIG.timeout });

  console.log('  → Preenchendo credenciais...');
  await page.fill('input[type="email"], #email, input[name="email"]', CONFIG.email);
  await page.fill('input[type="password"], #password, input[name="password"]', CONFIG.password);
  await page.click('button[data-action="login"], #btn-login, button:has-text("ENTRAR")');

  await page.waitForSelector('.tm-status-line, #page-home, .home-layout', { timeout: CONFIG.timeout });
  console.log('  ✓ Login realizado');
}

async function navigateToSection(page, section) {
  if (!section.action) return;
  const btn = await page.$(`[data-action="${section.action}"], [data-section="${section.action}"]`);
  if (btn) {
    await btn.click();
  } else {
    await page.evaluate(a => { window.location.hash = a; }, section.action);
  }
  try {
    await page.waitForSelector(section.waitFor, { timeout: 5000 });
  } catch {
    console.log(`  ⚠️  Seletor "${section.waitFor}" não encontrado — continuando`);
  }
  await page.waitForTimeout(600);
}

async function runAccessibilityCheck(page) {
  const issues = [];

  const imgsWithoutAlt = await page.$$eval('img:not([alt])', els => els.length);
  if (imgsWithoutAlt > 0)
    issues.push({ type: 'error', rule: 'img-alt', message: `${imgsWithoutAlt} imagem(ns) sem atributo alt` });

  const btnsWithoutText = await page.$$eval(
    'button:not([aria-label]):not([title])',
    els => els.filter(el => !el.textContent.trim()).length
  );
  if (btnsWithoutText > 0)
    issues.push({ type: 'error', rule: 'button-name', message: `${btnsWithoutText} botão(ões) sem texto ou aria-label` });

  const inputsWithoutLabel = await page.$$eval(
    'input:not([type="hidden"]):not([aria-label]):not([aria-labelledby])',
    els => els.filter(el => !el.id || !document.querySelector(`label[for="${el.id}"]`)).length
  );
  if (inputsWithoutLabel > 0)
    issues.push({ type: 'warning', rule: 'label', message: `${inputsWithoutLabel} input(s) sem label associado` });

  const selectsWithoutLabel = await page.$$eval(
    'select:not([aria-label]):not([aria-labelledby])',
    els => els.filter(el => !el.id || !document.querySelector(`label[for="${el.id}"]`)).length
  );
  if (selectsWithoutLabel > 0)
    issues.push({ type: 'warning', rule: 'select-label', message: `${selectsWithoutLabel} select(s) sem label associado` });

  const emptyLinks = await page.$$eval(
    'a:not([aria-label])', els => els.filter(el => !el.textContent.trim()).length
  );
  if (emptyLinks > 0)
    issues.push({ type: 'warning', rule: 'link-name', message: `${emptyLinks} link(s) sem texto descritivo` });

  const jsErrors = await page.evaluate(() => window.__auditErrors || []);
  jsErrors.forEach(err =>
    issues.push({ type: 'error', rule: 'js-error', message: `Erro JS: ${err}` })
  );

  return issues;
}

async function runLighthouse(browser, url) {
  try {
    const wsEndpoint = browser.wsEndpoint();
    const port = new URL(wsEndpoint).port;
    const result = await lighthouse(url, {
      port: parseInt(port),
      output: 'json',
      logLevel: 'error',
      onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
      settings: {
        formFactor: 'mobile',
        throttling: { rttMs: 40, throughputKbps: 10240, cpuSlowdownMultiplier: 4 },
      },
    });
    return result?.lhr || null;
  } catch (err) {
    console.log(`  ⚠️  Lighthouse falhou: ${err.message}`);
    return null;
  }
}

function generateReport(results) {
  const now = new Date().toLocaleString('pt-BR');
  const totalIssues = results.reduce((sum, r) => sum + r.issues.length, 0);
  const totalErrors = results.reduce((sum, r) => sum + r.issues.filter(i => i.type === 'error').length, 0);

  const sectionCards = results.map(r => {
    const issueRows = r.issues.map(i => `
      <div class="issue issue-${i.type}">
        <span class="issue-icon">${i.type === 'error' ? '❌' : '⚠️'}</span>
        <span class="issue-rule">${i.rule}</span>
        <span class="issue-msg">${i.message}</span>
      </div>`).join('');

    const lh = r.lighthouse;
    const lhBlock = lh ? `
      <div class="lh-scores">
        <div class="lh-score"><span class="lh-label">Performance</span><span class="lh-value">${formatScore(lh.categories?.performance?.score)}</span></div>
        <div class="lh-score"><span class="lh-label">Acessibilidade</span><span class="lh-value">${formatScore(lh.categories?.accessibility?.score)}</span></div>
        <div class="lh-score"><span class="lh-label">Boas práticas</span><span class="lh-value">${formatScore(lh.categories?.['best-practices']?.score)}</span></div>
        <div class="lh-score"><span class="lh-label">SEO</span><span class="lh-value">${formatScore(lh.categories?.seo?.score)}</span></div>
      </div>
      <div class="lh-metrics">
        <span>FCP: ${formatMs(lh.audits?.['first-contentful-paint']?.numericValue)}</span>
        <span>LCP: ${formatMs(lh.audits?.['largest-contentful-paint']?.numericValue)}</span>
        <span>TBT: ${formatMs(lh.audits?.['total-blocking-time']?.numericValue)}</span>
        <span>CLS: ${lh.audits?.['cumulative-layout-shift']?.displayValue || '—'}</span>
      </div>` : '<p class="no-lh">Lighthouse não disponível para esta seção</p>';

    const screenshot = r.screenshot
      ? `<img src="${path.basename(r.screenshot)}" class="section-screenshot" alt="Screenshot ${r.name}">`
      : '';

    return `
    <div class="section-card${r.issues.length === 0 ? ' section-ok' : ''}">
      <div class="section-header">
        <h2>${r.name}</h2>
        <span class="issue-count ${r.issues.length === 0 ? 'count-ok' : 'count-issues'}">
          ${r.issues.length === 0 ? '✅ Sem problemas' : `${r.issues.length} problema(s)`}
        </span>
      </div>
      ${screenshot}
      ${lhBlock}
      <div class="issues-list">
        ${issueRows || '<p class="no-issues">Nenhum problema encontrado.</p>'}
      </div>
    </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Night City Audit — ${now}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Segoe UI',system-ui,sans-serif;background:#0a0a0f;color:#e8e8f0;padding:32px 24px 80px}
  h1{font-size:28px;margin-bottom:8px;color:#00f5a0}
  .meta{color:#6b6b80;font-size:13px;margin-bottom:32px}
  .summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:40px}
  .summary-card{background:#13131c;border:1px solid #1e1e2e;border-radius:12px;padding:16px;text-align:center}
  .summary-card .num{font-size:36px;font-weight:700}
  .summary-card .label{font-size:12px;color:#6b6b80;margin-top:4px}
  .num-error{color:#f72585}.num-warning{color:#ffd60a}.num-ok{color:#00f5a0}
  .section-card{background:#13131c;border:1px solid #1e1e2e;border-radius:14px;padding:24px;margin-bottom:20px}
  .section-ok{border-color:rgba(0,245,160,0.2)}
  .section-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}
  .section-header h2{font-size:18px}
  .issue-count{font-size:12px;padding:4px 10px;border-radius:6px}
  .count-ok{background:rgba(0,245,160,0.1);color:#00f5a0}
  .count-issues{background:rgba(247,37,133,0.1);color:#f72585}
  .section-screenshot{width:100%;max-width:400px;border-radius:8px;margin-bottom:16px;border:1px solid #1e1e2e}
  .lh-scores{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px}
  .lh-score{background:#0a0a0f;border-radius:8px;padding:10px;text-align:center}
  .lh-label{display:block;font-size:10px;color:#6b6b80;margin-bottom:4px}
  .lh-value{font-size:16px;font-weight:700;font-family:monospace}
  .lh-metrics{display:flex;gap:16px;font-size:12px;color:#6b6b80;margin-bottom:16px;font-family:monospace}
  .issue{display:flex;align-items:flex-start;gap:8px;padding:8px 0;border-bottom:1px solid #1e1e2e;font-size:13px}
  .issue:last-child{border-bottom:none}
  .issue-rule{color:#00b4d8;font-family:monospace;font-size:11px;min-width:100px;padding-top:1px}
  .issue-msg{color:#c8c8d8;flex:1}
  .no-issues,.no-lh{color:#6b6b80;font-size:13px;padding:8px 0}
</style>
</head>
<body>
<h1>🌃 Night City Audit</h1>
<p class="meta">Gerado em ${now} · ${results.length} seções auditadas</p>
<div class="summary">
  <div class="summary-card"><div class="num num-error">${totalErrors}</div><div class="label">Erros críticos</div></div>
  <div class="summary-card"><div class="num num-warning">${totalIssues - totalErrors}</div><div class="label">Avisos</div></div>
  <div class="summary-card"><div class="num num-ok">${results.filter(r => r.issues.length === 0).length}</div><div class="label">Seções limpas</div></div>
  <div class="summary-card"><div class="num" style="color:#00b4d8">${results.length}</div><div class="label">Total auditadas</div></div>
</div>
${sectionCards}
</body>
</html>`;
}

async function main() {
  console.log('\n🌃 Night City Audit\n');

  if (!CONFIG.email || !CONFIG.password) {
    console.error('❌ Defina as variáveis de ambiente AUDIT_EMAIL e AUDIT_PASSWORD');
    console.error('   Exemplo: AUDIT_EMAIL=seu@email.com AUDIT_PASSWORD=suasenha npm run audit\n');
    process.exit(1);
  }

  ensureOutputDir();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
  });
  const page = await context.newPage();

  await page.addInitScript(() => {
    window.__auditErrors = [];
    window.addEventListener('error', e => window.__auditErrors.push(e.message));
    window.addEventListener('unhandledrejection', e => window.__auditErrors.push(String(e.reason)));
  });

  const results = [];

  try {
    await doLogin(page);

    for (const section of SECTIONS) {
      console.log(`\n📋 Auditando: ${section.name}`);
      try {
        await navigateToSection(page, section);

        const screenshotPath = path.join(CONFIG.outputDir, `audit-${section.name.toLowerCase().replace(/\s+/g, '-')}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false });
        console.log('  📸 Screenshot salvo');

        const issues = await runAccessibilityCheck(page);
        console.log(`  🔍 ${issues.length} problema(s) encontrado(s)`);

        let lhResult = null;
        if (section.name === 'Modo Hoje') {
          console.log('  🔦 Rodando Lighthouse...');
          lhResult = await runLighthouse(browser, page.url());
          if (lhResult) {
            const perf = Math.round((lhResult.categories?.performance?.score || 0) * 100);
            const a11y = Math.round((lhResult.categories?.accessibility?.score || 0) * 100);
            console.log(`  📊 Performance: ${perf} · Acessibilidade: ${a11y}`);
          }
        }

        results.push({ name: section.name, issues, lighthouse: lhResult, screenshot: screenshotPath });

      } catch (err) {
        console.log(`  ❌ Erro ao auditar ${section.name}: ${err.message}`);
        results.push({
          name: section.name,
          issues: [{ type: 'error', rule: 'audit-error', message: err.message }],
          lighthouse: null,
          screenshot: null,
        });
      }
    }
  } finally {
    await browser.close();
  }

  const reportPath = path.join(CONFIG.outputDir, 'audit.html');
  fs.writeFileSync(reportPath, generateReport(results), 'utf8');

  const totalIssues = results.reduce((sum, r) => sum + r.issues.length, 0);
  const totalErrors = results.reduce((sum, r) => sum + r.issues.filter(i => i.type === 'error').length, 0);

  console.log('\n─────────────────────────────────');
  console.log('✅ Auditoria concluída');
  console.log(`   ${totalErrors} erros · ${totalIssues - totalErrors} avisos`);
  console.log(`   Relatório: ${reportPath}`);
  console.log('─────────────────────────────────\n');

  if (totalErrors > 0) process.exit(1);
}

main().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
