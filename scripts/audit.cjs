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

// Cada seção define navigate (async fn que recebe page) e waitFor.
// navigate: null = capturada antes do login (tela de login).
const SECTIONS = [
  {
    name: 'Login',
    navigate: null,
    waitFor: 'input[type="email"], #auth-email-input',
    cleanup: null,
  },
  {
    name: 'Modo Hoje',
    navigate: async (page) => {
      await page.evaluate(() => {
        if (typeof closeHomeModule === 'function') closeHomeModule();
        if (typeof closeMissionFocus === 'function') closeMissionFocus();
        if (typeof goPage === 'function') goPage('home');
        if (typeof toggleHomeMenu === 'function') toggleHomeMenu(false);
        document.body.classList.add('today-mode');
      });
      await page.waitForTimeout(600);
    },
    waitFor: 'body.today-mode, .tm-status-line',
    cleanup: null,
  },
  {
    name: 'Contratos',
    navigate: async (page) => {
      await page.evaluate(() => {
        if (typeof closeHomeModule === 'function') closeHomeModule();
        if (typeof closeMissionFocus === 'function') closeMissionFocus();
        if (typeof goPage === 'function') goPage('home');
        if (typeof toggleHomeMenu === 'function') toggleHomeMenu(false);
        document.body.classList.remove('today-mode');
      });
      await page.waitForTimeout(500);
    },
    waitFor: '#task-list, .task-list',
    cleanup: null,
  },
  {
    name: 'Modo Foco',
    navigate: async (page) => {
      await page.evaluate(() => {
        if (typeof goPage === 'function') goPage('home');
        if (typeof openMissionFocus === 'function') {
          openMissionFocus({ text: 'AUDIT — interface de foco', tag: 'AUDIT' });
        }
      });
      await page.waitForTimeout(700);
    },
    waitFor: '#mission-focus:not([aria-hidden="true"]), .mission-focus-panel',
    cleanup: async (page) => {
      await page.evaluate(() => {
        if (typeof closeMissionFocus === 'function') closeMissionFocus();
      });
      await page.waitForTimeout(600);
    },
  },
  {
    name: 'Distritos (Side Deck)',
    navigate: async (page) => {
      await page.evaluate(() => {
        if (typeof closeHomeModule === 'function') closeHomeModule();
        if (typeof goPage === 'function') goPage('home');
        if (typeof toggleHomeMenu === 'function') toggleHomeMenu(true);
      });
      await page.waitForTimeout(500);
    },
    waitFor: 'body.home-menu-open, #home-drawer',
    cleanup: async (page) => {
      await page.evaluate(() => {
        if (typeof toggleHomeMenu === 'function') toggleHomeMenu(false);
      });
      await page.waitForTimeout(300);
    },
  },
  {
    name: 'Leitura',
    navigate: async (page) => {
      await page.evaluate(() => {
        if (typeof goPage === 'function') goPage('leitura');
      });
      await page.waitForTimeout(500);
    },
    waitFor: '#page-leitura.active',
    cleanup: null,
  },
  {
    name: 'Dev',
    navigate: async (page) => {
      await page.evaluate(() => {
        if (typeof goPage === 'function') goPage('dev');
      });
      await page.waitForTimeout(500);
    },
    waitFor: '#page-dev.active',
    cleanup: null,
  },
  {
    name: 'Configuracao',
    navigate: async (page) => {
      await page.evaluate(() => {
        if (typeof goPage === 'function') goPage('home');
        if (typeof openSettingsModule === 'function') openSettingsModule();
      });
      await page.waitForTimeout(500);
    },
    waitFor: '.settings-center',
    cleanup: null,
  },
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
  // Recarregar só se necessário (login screenshot já pode ter navegado)
  const currentUrl = page.url();
  if (!currentUrl.startsWith(CONFIG.url.replace(/\/$/, ''))) {
    console.log('  → Abrindo app...');
    await page.goto(CONFIG.url, { waitUntil: 'networkidle', timeout: CONFIG.timeout });
  }

  await page.waitForSelector('#auth-email-input, input[type="email"]', { timeout: CONFIG.timeout });

  console.log('  → Preenchendo credenciais...');
  await page.fill('#auth-email-input, input[type="email"]', CONFIG.email);
  await page.fill('#pwd-input, input[type="password"]', CONFIG.password);
  await page.click('button[data-action="login"], button:has-text("ENTRAR")');

  // #login-screen recebe style="display:none" após auth Supabase — único sinal confiável
  await page.waitForSelector('#login-screen', { state: 'hidden', timeout: CONFIG.timeout });

  // Aguardar app renderizar conteúdo pós-login (nav tabs ou today-mode)
  await page.waitForSelector('#nav-tabs, .nav-tab, body.today-mode', { timeout: CONFIG.timeout });
  await page.waitForTimeout(1500);

  console.log('  ✓ Login realizado e app carregado');
}

async function navigateToSection(page, section) {
  if (!section.navigate) return;
  console.log(`  → Navegando para ${section.name}...`);
  try {
    await section.navigate(page);
    await page.waitForSelector(section.waitFor, { timeout: 6000 });
    console.log('  ✓ Seção carregada');
  } catch {
    const debugPath = path.join(CONFIG.outputDir, `debug-${section.name.toLowerCase().replace(/\s+/g, '-')}.png`);
    await page.screenshot({ path: debugPath });
    console.log(`  ⚠️  Seletor "${section.waitFor}" não encontrado — debug em ${path.basename(debugPath)}`);
  }
  await page.waitForTimeout(400);
}

async function cleanupAfterSection(page, section) {
  if (!section.cleanup) return;
  console.log(`  → Cleanup após ${section.name}...`);
  try {
    await section.cleanup(page);
  } catch (err) {
    console.log(`  ⚠️  Cleanup falhou: ${err.message}`);
  }
}

// Aceita seletor único ou array de seletores — tenta cada um em ordem.
async function tryClick(page, selectorOrArray) {
  const selectors = Array.isArray(selectorOrArray) ? selectorOrArray : [selectorOrArray];
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (el) { await el.click(); await page.waitForTimeout(300); return true; }
    } catch {}
  }
  return false;
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
    els => els.filter(el => !el.closest('label') && (!el.id || !document.querySelector(`label[for="${el.id}"]`))).length
  );
  if (inputsWithoutLabel > 0)
    issues.push({ type: 'warning', rule: 'label', message: `${inputsWithoutLabel} input(s) sem label associado` });

  const selectsWithoutLabel = await page.$$eval(
    'select:not([aria-label]):not([aria-labelledby])',
    els => els.filter(el => !el.closest('label') && (!el.id || !document.querySelector(`label[for="${el.id}"]`))).length
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

async function captureAppMetrics(page) {
  try {
    return await page.evaluate(() => ({
      streetCred: document.querySelector('.street-cred-value, [data-metric="cred"]')?.textContent?.trim() || '—',
      eddies: document.querySelector('.eddies-value, [data-metric="eddies"]')?.textContent?.trim() || '—',
      streak: document.querySelector('.streak-value, [data-metric="streak"]')?.textContent?.trim() ||
              document.querySelector('.tm-status-line')?.textContent?.match(/\d+d/)?.[0] || '—',
      contratosHoje: document.querySelector('.tm-status-line')?.textContent?.trim() || '—',
    }));
  } catch {
    return null;
  }
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

// Audita uma seção com timeout de segurança de 20s.
async function auditSection(page, section) {
  return Promise.race([
    _auditSectionInner(page, section),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout de 20s ao auditar seção')), 20000)
    ),
  ]);
}

async function _auditSectionInner(page, section) {
  await navigateToSection(page, section);

  const screenshotPath = path.join(
    CONFIG.outputDir,
    `audit-${section.name.toLowerCase().replace(/\s+/g, '-')}.png`
  );
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log('  📸 Screenshot salvo');

  const issues = await runAccessibilityCheck(page);
  console.log(`  🔍 ${issues.length} problema(s) encontrado(s)`);

  let lhResult = null;
  if (section.name === 'Modo Hoje') {
    console.log('  🔦 Rodando Lighthouse...');
    lhResult = await runLighthouse(page._browser || page.context().browser(), page.url());
    if (lhResult) {
      const perf = Math.round((lhResult.categories?.performance?.score || 0) * 100);
      const a11y = Math.round((lhResult.categories?.accessibility?.score || 0) * 100);
      console.log(`  📊 Performance: ${perf} · Acessibilidade: ${a11y}`);
    }
  }

  await cleanupAfterSection(page, section);
  return { name: section.name, issues, lighthouse: lhResult, screenshot: screenshotPath };
}

function generateReport(results, metrics) {
  const now = new Date().toLocaleString('pt-BR');
  const totalIssues = results.reduce((sum, r) => sum + r.issues.length, 0);
  const totalErrors = results.reduce((sum, r) => sum + r.issues.filter(i => i.type === 'error').length, 0);

  const metricsBlock = metrics ? `
    <div class="metrics-bar">
      <span>🔥 Streak: <b>${metrics.streak}</b></span>
      <span>📊 Status: <b>${metrics.contratosHoje}</b></span>
    </div>` : '';

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
      </div>` : '';

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
  .meta{color:#6b6b80;font-size:13px;margin-bottom:16px}
  .metrics-bar{display:flex;gap:20px;font-size:13px;margin-bottom:28px;padding:10px 14px;background:#13131c;border-radius:8px;border:1px solid #1e1e2e}
  .metrics-bar b{color:#00f5a0}
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
  .section-screenshot{width:100%;max-width:400px;border-radius:8px;margin-bottom:16px;border:1px solid #1e1e2e;display:block}
  .lh-scores{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px}
  .lh-score{background:#0a0a0f;border-radius:8px;padding:10px;text-align:center}
  .lh-label{display:block;font-size:10px;color:#6b6b80;margin-bottom:4px}
  .lh-value{font-size:16px;font-weight:700;font-family:monospace}
  .lh-metrics{display:flex;gap:16px;font-size:12px;color:#6b6b80;margin-bottom:16px;font-family:monospace}
  .issue{display:flex;align-items:flex-start;gap:8px;padding:8px 0;border-bottom:1px solid #1e1e2e;font-size:13px}
  .issue:last-child{border-bottom:none}
  .issue-rule{color:#00b4d8;font-family:monospace;font-size:11px;min-width:100px;padding-top:1px}
  .issue-msg{color:#c8c8d8;flex:1}
  .no-issues{color:#6b6b80;font-size:13px;padding:8px 0}
</style>
</head>
<body>
<h1>🌃 Night City Audit</h1>
<p class="meta">Gerado em ${now} · ${results.length} seções auditadas</p>
${metricsBlock}
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

  let exitCode = 0;
  ensureOutputDir();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
  });
  const page = await context.newPage();
  // Expor browser para Lighthouse
  page._browser = browser;

  await page.addInitScript(() => {
    window.__auditErrors = [];
    window.addEventListener('error', e => window.__auditErrors.push(e.message));
    window.addEventListener('unhandledrejection', e => window.__auditErrors.push(String(e.reason)));
  });

  const results = [];

  try {
    // ── Captura Login ANTES do login ──────────────────────────────────
    console.log('\n📋 Auditando: Login');
    await page.goto(CONFIG.url, { waitUntil: 'networkidle', timeout: CONFIG.timeout });
    try {
      await page.waitForSelector('#auth-email-input, input[type="email"]', { timeout: 10000 });
    } catch {
      console.log('  ⚠️  Tela de login não detectada — talvez já autenticado');
    }
    const loginScreenshot = path.join(CONFIG.outputDir, 'audit-login.png');
    await page.screenshot({ path: loginScreenshot, fullPage: false });
    console.log('  📸 Screenshot salvo');
    const loginIssues = await runAccessibilityCheck(page);
    console.log(`  🔍 ${loginIssues.length} problema(s) encontrado(s)`);
    results.push({ name: 'Login', issues: loginIssues, lighthouse: null, screenshot: loginScreenshot });

    // ── Login ──────────────────────────────────────────────────────────
    console.log('\n→ Realizando login...');
    await doLogin(page);

    // Métricas do app (captura após login, antes de mudar de seção)
    const metrics = await captureAppMetrics(page);

    // ── Demais seções ──────────────────────────────────────────────────
    for (const section of SECTIONS.filter(s => s.navigate !== null)) {
      console.log(`\n📋 Auditando: ${section.name}`);
      try {
        const result = await auditSection(page, section);
        results.push(result);
      } catch (err) {
        console.log(`  ❌ Erro: ${err.message}`);
        results.push({
          name: section.name,
          issues: [{ type: 'error', rule: 'audit-error', message: err.message }],
          lighthouse: null,
          screenshot: null,
        });
      }
    }

    const reportPath = path.join(CONFIG.outputDir, 'audit.html');
    fs.writeFileSync(reportPath, generateReport(results, metrics), 'utf8');

    const totalIssues = results.reduce((sum, r) => sum + r.issues.length, 0);
    const totalErrors = results.reduce((sum, r) => sum + r.issues.filter(i => i.type === 'error').length, 0);

    console.log('\n─────────────────────────────────');
    console.log('✅ Auditoria concluída');
    console.log(`   ${totalErrors} erros · ${totalIssues - totalErrors} avisos`);
    console.log(`   Relatório: ${reportPath}`);
    console.log('─────────────────────────────────\n');

    if (totalErrors > 0) {
      console.error(`❌ ${totalErrors} erro(s) crítico(s) encontrado(s)`);
      exitCode = 1;
    }

  } finally {
    await browser.close();
  }

  process.exit(exitCode);
}

main().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
