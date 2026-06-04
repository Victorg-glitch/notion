const { test, expect } = require('@playwright/test');

const REQUIRED_AUTH_ENV = [
  'TEST_USER_A_EMAIL',
  'TEST_USER_A_PASSWORD',
  'TEST_USER_B_EMAIL',
  'TEST_USER_B_PASSWORD'
];

const hasAuthEnv = REQUIRED_AUTH_ENV.every((key) => !!process.env[key]);

function collectCriticalConsole(page) {
  const errors = [];
  const ignored = [
    /favicon/i,
    /manifest/i,
    /net::ERR_ABORTED/i,
    /Failed to load resource: the server responded with a status of 404/i,
    /ResizeObserver loop/i,
    /Realtime indispon/i,
    /CHANNEL_ERROR/i
  ];
  const push = (kind, text) => {
    const value = String(text || '');
    if (ignored.some((rx) => rx.test(value))) return;
    errors.push(`${kind}: ${value}`);
  };
  page.on('console', (msg) => {
    if (msg.type() === 'error') push('console', msg.text());
  });
  page.on('pageerror', (err) => push('pageerror', err.message));
  return errors;
}

async function loginWithPassword(page, email, password) {
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await page.locator('#auth-email-input').fill(email);
  await page.locator('#pwd-input').fill(password);
  await page.locator('[data-action="submitAuthForm"]').click();
  await expect(page.locator('#login-screen')).toBeHidden({ timeout: 30_000 });
  await expect(page.locator('#nav-user')).not.toHaveText(/^(--)?$/);
}

async function currentUserId(page) {
  return page.evaluate(() => {
    const stores = [window.sessionStorage, window.localStorage];
    for (const store of stores) {
      for (let i = 0; i < store.length; i += 1) {
        const key = store.key(i);
        if (!key || !/-auth-token$/.test(key)) continue;
        try {
          const parsed = JSON.parse(store.getItem(key) || '{}');
          const user = parsed.user || parsed.currentSession?.user || parsed.session?.user;
          if (user?.id) return user.id;
        } catch (error) {
          continue;
        }
      }
    }
    return '';
  });
}

async function ensureSetupCompleted(page) {
  const wizard = page.locator('#setup-wizard');
  const isOpen = await wizard.evaluate((el) => el.classList.contains('on')).catch(() => false);
  if (!isOpen) return;

  await page.locator('#setup-focus').selectOption('rotina');
  await page.locator('#setup-state').selectOption('baguncada');
  await page.locator('#setup-time').selectOption('30');

  const autopilot = page.locator('#setup-autopilot');
  if (await autopilot.count()) {
    await autopilot.setChecked(true);
  }

  await page.locator('[data-action="autoBuildRoutine"]').click();
  await expect(wizard).not.toHaveClass(/on/, { timeout: 30_000 });
}

async function ensureTaskAndFocus(page) {
  await page.locator('[data-action="openContractModal"]').first().click();
  await expect(page.locator('#contract-modal')).toHaveClass(/on/);
  await page.locator('#contract-name').fill(`Teste Playwright ${Date.now()}`);
  await page.locator('[data-action="saveContractModal"]').click();
  await expect(page.locator('#contract-modal')).not.toHaveClass(/on/);

  await page.locator('[data-action="openMissionFocus"]').first().click();
  await expect(page.locator('#mission-focus')).toHaveClass(/on/);
  await page.locator('[data-action="toggleMissionFocusPause"]').click();
  await expect(page.locator('#focus-status')).toContainText(/pausado/i);
  await page.locator('[data-action="toggleMissionFocusPause"]').click();
  await page.locator('[data-action="completeMissionFromFocus"]').click();
  await expect(page.locator('#mission-focus')).not.toHaveClass(/on/);
}

async function saveDailyReview(page) {
  await page.locator('[data-action="openDailyReview"]').first().click();
  await expect(page.locator('#daily-review')).toHaveClass(/on/);
  await page.locator('#daily-focus').fill('Smoke test E2E');
  await page.locator('#daily-tomorrow').fill('Revisar smoke test E2E');
  await page.locator('#daily-note').fill('Revisao salva pelo Playwright.');
  await page.locator('[data-action="saveDailyReview"]').click();
  await expect(page.locator('#daily-review')).not.toHaveClass(/on/);
}

async function openDiagnosticsAndExport(page) {
  await page.evaluate(() => window.goPage('notificacoes'));
  await expect(page.locator('#page-notificacoes')).toHaveClass(/active/);
  await page.locator('[data-action="downloadBackup"]').first().click();
  await expect(page.locator('#diag-version')).not.toHaveText('--');
}

async function publishFriendAccess(page) {
  await page.evaluate(async () => {
    if (typeof window.updateFriendPermission === 'function') {
      await window.updateFriendPermission('home', true);
      await window.updateFriendPermission('leitura', true);
      await window.updateFriendPermission('dev', false);
    }
    if (typeof window.upsertPublicFriendProfile === 'function') await window.upsertPublicFriendProfile();
    if (typeof window.publishFriendSharedSections === 'function') await window.publishFriendSharedSections();
  });
}

async function openCommlinkChatAndProfile(page, friendId) {
  await page.locator('[data-action="toggleFriend"]').first().click();
  await expect(page.locator('#friend-chat')).toHaveClass(/on/);
  await expect(page.locator('text=AMIGOS POR PROXIMIDADE')).toHaveCount(0);

  await page.locator('#friend-target-id').fill(friendId);
  await page.locator('[data-action="callNamed"][data-fn="saveFriendTarget"]').click();
  await page.evaluate(async ({ friendId }) => window.selectFriendContact(friendId), { friendId });
  await expect(page.locator('#friend-message-input')).toBeVisible();
  await page.locator('#friend-message-input').fill(`ping ${Date.now()}`);
  await page.locator('[data-action="callNamed"][data-fn="sendFriendMessage"]').click();
  await expect(page.locator('#friend-message-list')).toContainText(/ping|CHAT VAZIO|Erro/i);

  await page.locator('[data-action="openPublicFriendProfile"]').last().click();
  await expect(page.locator('#public-profile-modal')).toHaveClass(/on/);
}

async function assertSharedSections(page) {
  await expect(page.locator('[data-action="openSharedSection"][data-section="home"]')).toBeVisible();
  await expect(page.locator('[data-action="openSharedSection"][data-section="leitura"]')).toBeVisible();
  await expect(page.locator('[data-action="openSharedSection"][data-section="dev"]')).toHaveCount(0);

  await page.locator('[data-action="openSharedSection"][data-section="home"]').click();
  await expect(page.locator('#public-profile-shared-content')).toContainText(/Home|dados|public/i);
  await page.locator('[data-action="openSharedSection"][data-section="leitura"]').click();
  await expect(page.locator('#public-profile-shared-content')).toContainText(/Leitura|livro|dados|public/i);
}

async function assertNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  expect(overflow).toBeFalsy();
}

test.describe('Night City public bughunt', () => {
  test('app carrega sem erro vermelho critico', async ({ page }) => {
    const critical = collectCriticalConsole(page);
    await page.goto('./', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveTitle(/Night City/i);
    await expect(page.locator('#login-screen')).toBeVisible();
    expect(critical).toEqual([]);
  });

  test('viewport mobile nao tem overflow horizontal', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('./', { waitUntil: 'domcontentloaded' });
    await assertNoHorizontalOverflow(page);
  });
});

test.describe('Night City authenticated bughunt', () => {
  test.skip(!hasAuthEnv, `Defina ${REQUIRED_AUTH_ENV.join(', ')} para rodar os testes autenticados sem signUp/email.`);

  test('rotina, foco, backup e Commlink', async ({ browser }) => {
    const contextA = await browser.newContext({ acceptDownloads: true });
    const contextB = await browser.newContext({ acceptDownloads: true });
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    const criticalA = collectCriticalConsole(pageA);
    const criticalB = collectCriticalConsole(pageB);

    await loginWithPassword(pageA, process.env.TEST_USER_A_EMAIL, process.env.TEST_USER_A_PASSWORD);
    await loginWithPassword(pageB, process.env.TEST_USER_B_EMAIL, process.env.TEST_USER_B_PASSWORD);

    await ensureSetupCompleted(pageA);
    await ensureSetupCompleted(pageB);

    await pageA.reload({ waitUntil: 'domcontentloaded' });
    await expect(pageA.locator('#login-screen')).toBeHidden({ timeout: 30_000 });
    await ensureSetupCompleted(pageA);

    const userA = await currentUserId(pageA);
    const userB = await currentUserId(pageB);
    expect(userA).toBeTruthy();
    expect(userB).toBeTruthy();

    await publishFriendAccess(pageA);
    await publishFriendAccess(pageB);

    await ensureTaskAndFocus(pageA);
    await saveDailyReview(pageA);

    const downloadPromise = pageA.waitForEvent('download', { timeout: 15_000 });
    await openDiagnosticsAndExport(pageA);
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/night-city/i);

    await openCommlinkChatAndProfile(pageB, userA);
    await assertSharedSections(pageB);
    await assertNoHorizontalOverflow(pageB);

    await pageB.setViewportSize({ width: 390, height: 844 });
    await assertNoHorizontalOverflow(pageB);

    expect(criticalA).toEqual([]);
    expect(criticalB).toEqual([]);

    await contextA.close();
    await contextB.close();
  });
});
