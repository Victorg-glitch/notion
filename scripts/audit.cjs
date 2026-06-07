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
  touchTargetMin: 44, // px — WCAG 2.5.5
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

  await page.waitForSelector('#login-screen', { state: 'hidden', timeout: CONFIG.timeout });
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
  try { await section.cleanup(page); } catch {}
}

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

// ── Checks ──────────────────────────────────────────────────────────────────

async function checkA11y(page, issues) {
  // Imagens sem alt
  const imgsWithoutAlt = await page.$$eval('img:not([alt])', els => els.length);
  if (imgsWithoutAlt > 0)
    issues.push({ type: 'error', rule: 'img-alt', message: `${imgsWithoutAlt} imagem(ns) sem atributo alt` });

  // Botões sem texto
  const btnsWithoutText = await page.$$eval(
    'button:not([aria-label]):not([title])',
    els => els.filter(el => !el.textContent.trim()).length
  );
  if (btnsWithoutText > 0)
    issues.push({ type: 'error', rule: 'button-name', message: `${btnsWithoutText} botão(ões) sem texto ou aria-label` });

  // Inputs visíveis sem label
  const inputsWithoutLabel = await page.$$eval(
    'input:not([type="hidden"]):not([aria-label]):not([aria-labelledby])',
    els => els.filter(el => {
      if (typeof el.checkVisibility === 'function' && !el.checkVisibility({ checkVisibilityCSS: true })) return false;
      return !el.closest('label') && (!el.id || !document.querySelector(`label[for="${el.id}"]`));
    }).length
  );
  if (inputsWithoutLabel > 0)
    issues.push({ type: 'warning', rule: 'label', message: `${inputsWithoutLabel} input(s) sem label associado` });

  // Selects visíveis sem label
  const selectsWithoutLabel = await page.$$eval(
    'select:not([aria-label]):not([aria-labelledby])',
    els => els.filter(el => {
      if (typeof el.checkVisibility === 'function' && !el.checkVisibility({ checkVisibilityCSS: true })) return false;
      return !el.closest('label') && (!el.id || !document.querySelector(`label[for="${el.id}"]`));
    }).length
  );
  if (selectsWithoutLabel > 0)
    issues.push({ type: 'warning', rule: 'select-label', message: `${selectsWithoutLabel} select(s) sem label associado` });

  // Links sem texto
  const emptyLinks = await page.$$eval(
    'a:not([aria-label])', els => els.filter(el => !el.textContent.trim()).length
  );
  if (emptyLinks > 0)
    issues.push({ type: 'warning', rule: 'link-name', message: `${emptyLinks} link(s) sem texto descritivo` });

  // Diálogos sem aria-labelledby/aria-label
  const dialogsWithoutLabel = await page.$$eval(
    '[role="dialog"]:not([aria-labelledby]):not([aria-label])', els => els.length
  );
  if (dialogsWithoutLabel > 0)
    issues.push({ type: 'warning', rule: 'dialog-label', message: `${dialogsWithoutLabel} dialog(s) sem aria-labelledby ou aria-label` });

  // Hierarquia de headings (h3+ sem h2 anterior, h4+ sem h3 anterior)
  const headingIssues = await page.evaluate(() => {
    const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')]
      .filter(h => {
        if (typeof h.checkVisibility === 'function') return h.checkVisibility({ checkVisibilityCSS: true });
        return true;
      })
      .map(h => parseInt(h.tagName[1]));
    const problems = [];
    for (let i = 1; i < headings.length; i++) {
      if (headings[i] - headings[i - 1] > 1)
        problems.push(`h${headings[i - 1]}→h${headings[i]}`);
    }
    const h1s = headings.filter(n => n === 1).length;
    if (h1s > 1) problems.push(`${h1s}× h1`);
    return problems;
  });
  if (headingIssues.length > 0)
    issues.push({ type: 'warning', rule: 'heading-order', message: `Hierarquia de headings quebrada: ${headingIssues.join(', ')}` });
}

async function checkLayout(page, issues) {
  // Overflow horizontal — exclui elementos dentro de containers position:fixed/sticky
  // (topbars, nav bars e overlays fixos não causam scroll horizontal no documento)
  const overflows = await page.evaluate(() => {
    const vw = window.innerWidth;
    const bad = [];
    const isInFixed = el => {
      let node = el.parentElement;
      while (node && node !== document.body) {
        const p = getComputedStyle(node).position;
        if (p === 'fixed' || p === 'sticky') return true;
        node = node.parentElement;
      }
      return false;
    };
    document.querySelectorAll('*').forEach(el => {
      try {
        const pos = getComputedStyle(el).position;
        if (pos === 'fixed' || pos === 'sticky') return;
        if (isInFixed(el)) return;
        const r = el.getBoundingClientRect();
        if (r.right > vw + 2) bad.push(el.tagName.toLowerCase() + (el.id ? '#' + el.id : el.className ? '.' + el.className.trim().split(/\s+/)[0] : ''));
      } catch {}
    });
    return [...new Set(bad)].slice(0, 5);
  });
  if (overflows.length > 0)
    issues.push({ type: 'error', rule: 'overflow-x', message: `Overflow horizontal em: ${overflows.join(', ')}` });

  // Alvos de toque < 44×44px — exclui botões compactos do HUD mobile (design intencional)
  const COMPACT_HUD = ['mobile-action', 'mob-tab', 'shell-menu-toggle'];
  const smallTargets = await page.evaluate((min, compact) => {
    const interactive = [...document.querySelectorAll('button, a[href], [role="button"], input[type="checkbox"], input[type="radio"]')];
    const bad = interactive.filter(el => {
      if (compact.some(c => el.classList.contains(c))) return false;
      if (typeof el.checkVisibility === 'function' && !el.checkVisibility({ checkVisibilityCSS: true })) return false;
      const r = el.getBoundingClientRect();
      return (r.width > 0 || r.height > 0) && (r.width < min || r.height < min);
    });
    return bad.slice(0, 8).map(el => {
      const r = el.getBoundingClientRect();
      const label = el.textContent?.trim().slice(0, 20) || el.getAttribute('aria-label') || el.id || el.className.split(' ')[0];
      return `"${label}" (${Math.round(r.width)}×${Math.round(r.height)}px)`;
    });
  }, CONFIG.touchTargetMin, COMPACT_HUD);
  if (smallTargets.length > 0)
    issues.push({ type: 'warning', rule: 'touch-target', message: `${smallTargets.length} alvo(s) de toque < ${CONFIG.touchTargetMin}px: ${smallTargets.join(', ')}` });
}

async function checkHtml(page, issues) {
  // IDs duplicados
  const dupIds = await page.evaluate(() => {
    const ids = [...document.querySelectorAll('[id]')].map(el => el.id);
    const counts = ids.reduce((acc, id) => { acc[id] = (acc[id] || 0) + 1; return acc; }, {});
    return Object.entries(counts).filter(([, n]) => n > 1).map(([id]) => id);
  });
  if (dupIds.length > 0)
    issues.push({ type: 'error', rule: 'duplicate-id', message: `IDs duplicados: ${dupIds.slice(0, 8).join(', ')}` });

  // Links sem href real
  const badLinks = await page.evaluate(() => {
    return [...document.querySelectorAll('a')].filter(a => {
      if (typeof a.checkVisibility === 'function' && !a.checkVisibility({ checkVisibilityCSS: true })) return false;
      const href = a.getAttribute('href');
      return !href || href === '#' || href === 'javascript:void(0)';
    }).length;
  });
  if (badLinks > 0)
    issues.push({ type: 'warning', rule: 'link-href', message: `${badLinks} link(s) sem href válido (href="#" ou ausente)` });
}

async function checkRuntime(page, issues, networkFailures) {
  // Erros JS não capturados
  const jsErrors = await page.evaluate(() => window.__auditErrors || []);
  jsErrors.forEach(err =>
    issues.push({ type: 'error', rule: 'js-error', message: `Erro JS: ${err}` })
  );

  // console.error interceptados (excluindo duplicatas de window.onerror)
  const consoleErrors = await page.evaluate(() => (window.__consoleErrors || []).slice(0, 5));
  consoleErrors.forEach(msg =>
    issues.push({ type: 'error', rule: 'console-error', message: `console.error: ${msg.slice(0, 120)}` })
  );

  // console.warn interceptados
  const consoleWarns = await page.evaluate(() => (window.__consoleWarnings || []).slice(0, 5));
  consoleWarns.forEach(msg =>
    issues.push({ type: 'warning', rule: 'console-warn', message: `console.warn: ${msg.slice(0, 120)}` })
  );

  // Falhas de rede (excluir extensões de browser e recursos opcionais)
  const ignoredPatterns = [/chrome-extension/, /favicon/, /\.map$/];
  const relevantFailures = networkFailures.filter(f =>
    !ignoredPatterns.some(p => p.test(f.url))
  );
  relevantFailures.forEach(f => {
    const severity = f.status >= 500 ? 'error' : 'warning';
    issues.push({ type: severity, rule: 'network', message: `HTTP ${f.status}: ${f.url.replace(/^https?:\/\/[^/]+/, '').slice(0, 80)}` });
  });

  // localStorage cheio
  const quotaError = await page.evaluate(() => {
    try {
      const key = '__audit_quota_test__';
      localStorage.setItem(key, 'x');
      localStorage.removeItem(key);
      return false;
    } catch {
      return true;
    }
  });
  if (quotaError)
    issues.push({ type: 'error', rule: 'storage-quota', message: 'localStorage cheio — QuotaExceededError detectado' });
}

async function checkNightCity(page, issues, sectionName) {
  // Checks específicos por seção
  if (sectionName === 'Modo Hoje') {
    // Status line deve ter conteúdo
    const statusText = await page.$eval('.tm-status-line', el => el.textContent.trim()).catch(() => '');
    if (!statusText)
      issues.push({ type: 'error', rule: 'nc-status', message: 'tm-status-line vazio — Modo Hoje não renderizou' });

    // HUD não deve mostrar "--" em campos principais
    const hudDashes = await page.evaluate(() => {
      const hudEls = document.querySelectorAll('.stat-val, .hud-val, [data-metric]');
      return [...hudEls].filter(el => el.textContent.trim() === '--').length;
    });
    if (hudDashes > 0)
      issues.push({ type: 'warning', rule: 'nc-hud', message: `${hudDashes} campo(s) do HUD mostrando "--" (dados não carregaram)` });
  }

  if (sectionName === 'Contratos') {
    // task-list deve ter conteúdo (seja tarefas ou empty state, não vazio)
    const taskListEmpty = await page.evaluate(() => {
      const el = document.getElementById('task-list');
      return el ? el.children.length === 0 : true;
    });
    if (taskListEmpty)
      issues.push({ type: 'error', rule: 'nc-tasks', message: '#task-list está vazio — renderização falhou' });
  }

  if (sectionName === 'Leitura') {
    const bookListEmpty = await page.evaluate(() => {
      const el = document.getElementById('book-list');
      return el ? el.children.length === 0 : true;
    });
    if (bookListEmpty)
      issues.push({ type: 'warning', rule: 'nc-books', message: '#book-list está vazio — dados não carregaram ou lista não renderizou' });
  }

  if (sectionName === 'Dev') {
    const projListEmpty = await page.evaluate(() => {
      const el = document.getElementById('proj-list');
      return el ? el.children.length === 0 : true;
    });
    if (projListEmpty)
      issues.push({ type: 'warning', rule: 'nc-proj', message: '#proj-list está vazio — dados não carregaram ou lista não renderizou' });
  }

  // Em todas as seções pós-login: verificar erros de sync Supabase visíveis
  const supabaseError = await page.evaluate(() => {
    return [...document.querySelectorAll('.sync-error, .error-banner, [data-error]')]
      .filter(el => {
        if (typeof el.checkVisibility === 'function') return el.checkVisibility({ checkVisibilityCSS: true });
        return true;
      }).length;
  });
  if (supabaseError > 0)
    issues.push({ type: 'error', rule: 'nc-sync', message: `${supabaseError} banner(s) de erro de sincronização visível(is)` });
}

async function runAllChecks(page, sectionName, networkFailures) {
  const issues = [];

  // Limpar rastreadores de runtime antes de coletar
  await page.evaluate(() => {
    window.__auditErrors = [];
    window.__consoleErrors = [];
    window.__consoleWarnings = [];
  });
  networkFailures.length = 0;

  // Aguardar um tick para garantir que os rastreadores estão limpos
  await page.waitForTimeout(200);

  // Executar todos os grupos de checks
  await Promise.all([
    checkA11y(page, issues),
    checkLayout(page, issues),
    checkHtml(page, issues),
  ]);

  // Runtime (usa networkFailures coletado durante a navegação)
  await checkRuntime(page, issues, networkFailures);

  // Night City específico (apenas pós-login)
  if (sectionName !== 'Login') {
    await checkNightCity(page, issues, sectionName);
  }

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

async function auditSection(page, section, networkFailures) {
  return Promise.race([
    _auditSectionInner(page, section, networkFailures),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout de 20s ao auditar seção')), 20000)
    ),
  ]);
}

async function _auditSectionInner(page, section, networkFailures) {
  await navigateToSection(page, section);

  const screenshotPath = path.join(
    CONFIG.outputDir,
    `audit-${section.name.toLowerCase().replace(/\s+/g, '-')}.png`
  );
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log('  📸 Screenshot salvo');

  const issues = await runAllChecks(page, section.name, networkFailures);
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

  // Agrupar todos os problemas por regra para o sumário
  const ruleCount = {};
  results.forEach(r => r.issues.forEach(i => { ruleCount[i.rule] = (ruleCount[i.rule] || 0) + 1; }));
  const topRules = Object.entries(ruleCount).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topRulesHtml = topRules.length
    ? `<div class="top-rules">${topRules.map(([rule, n]) => `<span class="rule-chip">${rule} <b>${n}</b></span>`).join('')}</div>`
    : '';

  const metricsBlock = metrics ? `
    <div class="metrics-bar">
      <span>🔥 Streak: <b>${metrics.streak}</b></span>
      <span>📊 Status: <b>${metrics.contratosHoje}</b></span>
    </div>` : '';

  const sectionCards = results.map(r => {
    const byType = { error: [], warning: [] };
    r.issues.forEach(i => (byType[i.type] || []).push(i));
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
          ${r.issues.length === 0 ? '✅ Sem problemas' : `${byType.error.length} erro(s) · ${byType.warning.length} aviso(s)`}
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
  .metrics-bar{display:flex;gap:20px;font-size:13px;margin-bottom:16px;padding:10px 14px;background:#13131c;border-radius:8px;border:1px solid #1e1e2e}
  .metrics-bar b{color:#00f5a0}
  .top-rules{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:28px}
  .rule-chip{background:#13131c;border:1px solid #1e1e2e;border-radius:6px;padding:4px 10px;font-size:11px;font-family:monospace;color:#6b6b80}
  .rule-chip b{color:#ffd60a;margin-left:6px}
  .summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:40px}
  .summary-card{background:#13131c;border:1px solid #1e1e2e;border-radius:12px;padding:16px;text-align:center}
  .summary-card .num{font-size:36px;font-weight:700}
  .summary-card .label{font-size:12px;color:#6b6b80;margin-top:4px}
  .num-error{color:#f72585}.num-warning{color:#ffd60a}.num-ok{color:#00f5a0}
  .section-card{background:#13131c;border:1px solid #1e1e2e;border-radius:14px;padding:24px;margin-bottom:20px}
  .section-ok{border-color:rgba(0,245,160,0.2)}
  .section-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px}
  .section-header h2{font-size:18px}
  .issue-count{font-size:12px;padding:4px 10px;border-radius:6px}
  .count-ok{background:rgba(0,245,160,0.1);color:#00f5a0}
  .count-issues{background:rgba(247,37,133,0.1);color:#f72585}
  .section-screenshot{width:100%;max-width:400px;border-radius:8px;margin-bottom:16px;border:1px solid #1e1e2e;display:block}
  .lh-scores{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px}
  .lh-score{background:#0a0a0f;border-radius:8px;padding:10px;text-align:center}
  .lh-label{display:block;font-size:10px;color:#6b6b80;margin-bottom:4px}
  .lh-value{font-size:16px;font-weight:700;font-family:monospace}
  .lh-metrics{display:flex;gap:16px;font-size:12px;color:#6b6b80;margin-bottom:16px;font-family:monospace;flex-wrap:wrap}
  .issue{display:flex;align-items:flex-start;gap:8px;padding:8px 0;border-bottom:1px solid #1e1e2e;font-size:13px}
  .issue:last-child{border-bottom:none}
  .issue-rule{color:#00b4d8;font-family:monospace;font-size:11px;min-width:110px;padding-top:1px;flex-shrink:0}
  .issue-msg{color:#c8c8d8;flex:1;word-break:break-word}
  .no-issues{color:#6b6b80;font-size:13px;padding:8px 0}
</style>
</head>
<body>
<h1>🌃 Night City Audit</h1>
<p class="meta">Gerado em ${now} · ${results.length} seções · ${Object.keys(ruleCount).length} tipos de check</p>
${metricsBlock}
${topRulesHtml}
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
  page._browser = browser;

  // ── Rastreadores globais ──────────────────────────────────────────
  await page.addInitScript(() => {
    window.__auditErrors = [];
    window.__consoleErrors = [];
    window.__consoleWarnings = [];
    // Erros JS não capturados
    window.addEventListener('error', e => window.__auditErrors.push(e.message));
    window.addEventListener('unhandledrejection', e => window.__auditErrors.push(String(e.reason)));
    // console.error / console.warn
    const _e = console.error.bind(console);
    const _w = console.warn.bind(console);
    console.error = (...a) => { window.__consoleErrors.push(a.join(' ')); _e(...a); };
    console.warn  = (...a) => { window.__consoleWarnings.push(a.join(' ')); _w(...a); };
  });

  // Interceptar respostas HTTP com falha
  const networkFailures = [];
  page.on('response', resp => {
    if (resp.status() >= 400) networkFailures.push({ url: resp.url(), status: resp.status() });
  });

  const results = [];

  try {
    // ── Login screenshot (antes do login) ────────────────────────────
    console.log('\n📋 Auditando: Login');
    await page.goto(CONFIG.url, { waitUntil: 'networkidle', timeout: CONFIG.timeout });
    try {
      await page.waitForSelector('#auth-email-input, input[type="email"]', { timeout: 10000 });
    } catch {
      console.log('  ⚠️  Tela de login não detectada');
    }
    const loginScreenshot = path.join(CONFIG.outputDir, 'audit-login.png');
    await page.screenshot({ path: loginScreenshot, fullPage: false });
    console.log('  📸 Screenshot salvo');
    const loginIssues = await runAllChecks(page, 'Login', networkFailures);
    console.log(`  🔍 ${loginIssues.length} problema(s) encontrado(s)`);
    results.push({ name: 'Login', issues: loginIssues, lighthouse: null, screenshot: loginScreenshot });

    // ── Login ─────────────────────────────────────────────────────────
    console.log('\n→ Realizando login...');
    await doLogin(page);
    const metrics = await captureAppMetrics(page);

    // ── Demais seções ─────────────────────────────────────────────────
    for (const section of SECTIONS.filter(s => s.navigate !== null)) {
      console.log(`\n📋 Auditando: ${section.name}`);
      try {
        const result = await auditSection(page, section, networkFailures);
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
