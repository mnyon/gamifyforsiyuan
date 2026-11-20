const { Plugin, getFrontend, toggleRightDock, showMessage } = require('siyuan');

module.exports = class GamifyForSiYuan extends Plugin {
  async onload() {
    this.disposed = false;
    if (globalThis.siyuan?.config?.readonly || globalThis.siyuan?.isPublish || document.body.classList.contains('body--settings')) return;
    this.storeKey = `gamify-for-siyuan:${globalThis.siyuan?.config?.system?.workspaceDir || location.origin}`;
    try { this.credentials = JSON.parse(localStorage.getItem(this.storeKey + ':credentials') || '{}'); }
    catch { this.credentials = {}; }
    this.testMode = TEST_BUILD;
    this.isMobile = ['mobile', 'browser-mobile'].includes(getFrontend());
    this.view = new GamifyView({ css: PLUGIN_CSS, onConnect: value => this.connect(value), onSound: value => {
      this.credentials.sound = value; this.saveCredentials(); this.view.soundEnabled = value;
    }, onRefresh: () => this.refresh(), onResolve: retry => this.resolveRewards(retry),
      onAdventureLoad: page => this.loadAdventure(page), onAdventureAction: (kind, key) => this.adventureAction(kind, key),
      /* @test-only:start */
      onTestAction: action => this.testAction(action)
      /* @test-only:end */
    });
    this.view.credentials(this.credentials);
    const reconcile = document.createElement('button'); reconcile.className = 'action-reconcile'; reconcile.textContent = '已在 Habitica 核对，解除操作暂停'; reconcile.hidden = true; reconcile.onclick = () => this.reconcileAdventure(); this.view.root.querySelector('.dashboard').append(reconcile); this.reconcileButton = reconcile;
    this.view.host.classList.toggle('mobile', this.isMobile);
    if (this.isMobile) {
      // SiYuan may leave its presentation class behind after unchecking on a
      // mobile WebView. Follow the explicit blank marker without editing notes.
      this.mobileTaskStyle = document.createElement('style');
      this.mobileTaskStyle.textContent = '.protyle-wysiwyg .li[data-type="NodeListItem"][data-subtype="t"][data-task=" "].protyle-task--done > div[data-node-id].p { color: inherit; text-decoration: none; }';
      document.head.append(this.mobileTaskStyle);
    }
    this.message = ''; this.status = 'offline'; this.backlog = 0;
    this.addIcons(HABITICA_ICON.replace('<svg ', '<symbol id="iconGamifyHabitica" ').replace('</svg>', '</symbol>'));
    const frontend = getFrontend();
    if (!['mobile', 'browser-mobile'].includes(frontend)) {
      this.dockClick = event => {
        const entry = event.target.closest?.('.dock__item');
        if (entry?.getAttribute('data-type') !== this.name + 'companion' || event.button > 0) return;
        event.preventDefault(); event.stopImmediatePropagation();
        if (this.view.card.hidden) this.open(entry); else this.view.close();
      };
      document.addEventListener('click', this.dockClick, true);
      const plugin = this;
      this.addDock({ type: 'companion', config: { position: 'RightBottom', size: { width: 0, height: 0 }, icon: 'iconGamifyHabitica', title: 'Gamify for SiYuan', show: false }, data: {},
        init() { queueMicrotask(() => { if (!plugin.disposed) toggleRightDock(false); }); } });
    } else {
      this.addTopBar({ icon: 'iconGamifyHabitica', title: 'Gamify for SiYuan', position: 'right', callback: () => this.open() });
    }
    this.setting = { open: () => { this.open(); this.view.settings(true); } };
    // One writer per local workspace/browser profile. Other windows only display.
    this.lockAbort = new AbortController();
    if (navigator.locks) {
      navigator.locks.request(this.storeKey + ':writer', { signal: this.lockAbort.signal }, async () => {
        if (this.disposed) return;
        this.active = true;
        try { await this.initializeWriter(); await new Promise(resolve => { this.releaseLock = resolve; if (this.disposed) resolve(); }); }
        catch (error) { this.message = error.message; this.status = 'waiting'; this.render(); }
      }).catch(error => { if (error.name !== 'AbortError') this.report(error); });
    } else {
      // Mobile SiYuan normally has one active app window and some WebViews do not
      // expose Web Locks. Keep the mobile plugin usable while retaining the lock
      // protection whenever the runtime provides it.
      this.active = true;
      this.initializeWriter().catch(error => { this.message = error.message; this.status = 'waiting'; this.render(); });
    }
    this.engine = this.engine || new TodoProgress(); this.render();
  }

  async initializeWriter() {
    this.progressStorage = new ProgressStorage(this.name);
    if (!this.testMode) {
      try { await this.restoreSharedConnection(); }
      catch { this.message = '未能读取同步连接信息；可以稍后刷新，或手动填写'; }
    }
    const state = this.testMode ? this.readTestState() : await this.progressStorage.read();
    if (this.disposed) return;
    this.engine = this.makeEngine(state);
    this.activity = new ActivityProgress(this.engine.state);
    this.activity.day();
    this.editing = new EditTracker({
      lookup: ids => this.requestSiYuan('/api/query/sql', { stmt: `SELECT id, updated FROM blocks WHERE id IN (${ids.map(id => `'${id}'`).join(',')}) LIMIT 200` }),
      onEdit: (edits, now) => this.recordEdits(edits, now), onError: error => this.report(error)
    });
    this.editing.start();
    this.observedClicks = new Map();
    this.localTasks = new Map();
    this.click = event => {
      if (!event.isTrusted) return;
      const action = event.target.closest?.('.protyle-action--task');
      const block = action?.closest('[data-node-id][data-subtype="t"]');
      if (!block) return;
      const context = { point: { x: event.clientX, y: event.clientY }, at: Date.now(), element: block, blockId: block.dataset.nodeId };
      this.observedClicks.set(block.dataset.nodeId, context);
      this.view.unlockSound(); this.scheduleScan(180);
    };
    document.addEventListener('click', this.click, true);
    this.taskObserver = new MutationObserver(records => {
      if (this.disposed || this.storageFailed || this.switchingMode) return;
      const changes = new Map();
      for (const record of records) {
        const block = record.target;
        if (!block.matches?.('.protyle-wysiwyg [data-type="NodeListItem"][data-subtype="t"]')) continue;
        const id = block.dataset.nodeId;
        if (!changes.has(id)) changes.set(id, { block, before: String(record.oldValue || ' ').toUpperCase() === 'X' });
      }
      for (const [id, { block, before }] of changes) {
        const done = String(block.getAttribute('data-task') || ' ').toUpperCase() === 'X';
        if (done === before) continue;
        this.localTasks.set(id, { done, at: Date.now() });
        const added = this.engine.localChange(id, done);
        this.localDirty = true;
        if (added) this.view.completeTodo({ blockId: id, element: block, ...progressPreview(this.engine.state) });
        else if (!done) this.view.cancelTodo(id);
      }
      if (changes.size) { this.render(); this.scheduleScan(80); }
    });
    this.taskObserver.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-task'], attributeOldValue: true });
    this.ws = event => { if (event.detail?.cmd === 'transactions') this.scheduleScan(250); };
    this.eventBus.on('ws-main', this.ws);
    await this.scan();
    this.timer = setInterval(() => {
      const elapsed = Date.now() - (this.lastScan || 0);
      this.editing?.prefetch();
      if ((Object.keys(this.engine.state.pending).length && elapsed >= (this.testMode ? 1000 : 5000)) || elapsed > 60000) this.scan();
    }, 1000);
    if (!this.testMode && this.credentials.userId && this.credentials.token) await this.connect(this.credentials).catch(error => this.report(error));
  }

  async requestSiYuan(path, body) {
    const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('思源暂时无法读取 TODO');
    const result = await response.json(); if (result.code !== 0) throw new Error(result.msg || 'TODO 读取失败'); return result.data;
  }
  scheduleScan(delay) { clearTimeout(this.scanTimer); this.scanTimer = setTimeout(() => this.scan(), delay); }
  async scan() {
    if (this.scanning || this.switchingMode || this.disposed || !this.active || this.storageFailed) return;
    this.scanning = true;
    try {
      // Keyset pagination avoids SiYuan's default SQL result cap.
      let last = ''; const rows = [];
      for (;;) {
        const page = await this.requestSiYuan('/api/query/sql', { stmt: `SELECT id, substr(markdown, 1, instr(markdown || char(10), char(10))-1) AS markdown FROM blocks WHERE type = 'i' AND subtype = 't' AND id > '${last}' ORDER BY id LIMIT 1000` });
        if (!Array.isArray(page)) throw new Error('TODO 查询结果不正确');
        rows.push(...page); if (!page.length) break;
        last = page.at(-1).id; if (!/^\d{14}-[a-z0-9]{7}$/.test(last)) throw new Error('TODO 标识不正确');
      }
      if (this.disposed) return;
      if (this.testMode) rows.push(...(this.testRows || []));
      // The editor is current; SQL indexing may still contain the previous toggle.
      const byId = new Map(rows.map(row => [row.id, row]));
      for (const [id, local] of this.localTasks || []) {
        const row = byId.get(id);
        if (row && taskDone(row.markdown) === local.done) { this.localTasks.delete(id); continue; }
        if (Date.now() - local.at > 30000) { this.localTasks.delete(id); continue; }
        if (row) row.markdown = local.done ? '* [X]' : '* [ ]';
        else rows.push({ id, markdown: local.done ? '* [X]' : '* [ ]' });
      }
      for (const block of document.querySelectorAll('.protyle-wysiwyg [data-type="NodeListItem"][data-subtype="t"][data-task]')) {
        const row = byId.get(block.dataset.nodeId);
        if (row) row.markdown = String(block.getAttribute('data-task')).toUpperCase() === 'X' ? '* [X]' : '* [ ]';
      }
      this.lastScan = Date.now();
      const before = JSON.stringify(this.engine.state);
      if (this.testMode) this.engine.state.snapshot = { day: calendarDay(), backlog: 300, target: 3 };
      const result = this.engine.observe(rows); this.backlog = result.backlog;
      if (before !== JSON.stringify(this.engine.state) || this.localDirty) await this.persist();
      this.localDirty = false;
      for (const id of result.completed) {
        const context = this.observedClicks.get(id);
        if (!context?.feedbacked) this.view.completeTodo(context && Date.now() - context.at < 15000 ? context : { blockId: id });
        this.observedClicks.delete(id);
      }
      for (const [id, context] of this.observedClicks) if (Date.now() - context.at > 15000) this.observedClicks.delete(id);
      this.render(); await this.flushRewards();
    } catch (error) { this.report(error); }
    finally { this.scanning = false; }
  }
  async persist() {
    const snapshot = JSON.parse(JSON.stringify(this.engine.state));
    if (this.testMode) { localStorage.setItem(this.storeKey + ':testProgress', JSON.stringify(snapshot)); return; }
    try {
      this.saveChain = (this.saveChain || Promise.resolve()).then(() => {
        if (this.storageFailed) throw new Error('进度保存已暂停');
        return this.progressStorage.write(snapshot);
      });
      await this.saveChain;
    }
    catch (error) {
      this.storageFailed = true;
      const detail = error?.message || error?.msg || '本地文件写入失败';
      throw new Error(`进度保存失败，已暂停奖励（${detail}）；请重新启用插件后重试`);
    }
  }
  saveCredentials() { localStorage.setItem(this.storeKey + ':credentials', JSON.stringify(this.credentials)); }
  recordEdits(edits, now) {
    if (this.disposed || this.storageFailed || !this.active) return;
    for (const edit of edits) {
      const result = this.activity.record(edit, now);
      if (result.maintenance > 0 && now - (this.lastMaintenanceEffect || 0) > 1500) {
        this.lastMaintenanceEffect = now;
        this.view.maintainBlock({ blockId: edit.id, weight: result.weight });
      }
    }
    if (edits.some(edit => edit.inserted + edit.deleted > 0)) {
      this.view.editingFeedback({ blockId: edits.at(-1).id, progress: editingApproach(this.engine.state, now) });
    }
    this.view.unlockSound();
    clearTimeout(this.activitySaveTimer);
    this.activitySaveTimer = setTimeout(async () => {
      try { await this.persist(); await this.flushRewards(); this.render(); }
      catch (error) { this.report(error); }
    }, 350);
  }
  async restoreSharedConnection() {
    if (this.testMode || (this.credentials.userId && this.credentials.token && !this.credentials.syncCredentials)) return false;
    const shared = await new ConnectionStorage(this.name).read();
    if (!shared) {
      if (this.credentials.syncCredentials) { this.credentials.syncCredentials = false; this.saveCredentials(); this.view.credentials(this.credentials); }
      return false;
    }
    this.credentials = { ...this.credentials, ...shared };
    this.saveCredentials(); this.view.credentials(this.credentials);
    return true;
  }
  async saveConnection(value) {
    if (this.testMode) return;
    const storage = new ConnectionStorage(this.name);
    if (value.syncCredentials === true) {
      const existing = await storage.read();
      if (!existing || existing.userId !== value.userId || existing.token !== value.token) await storage.save(value);
    }
    else if (this.credentials.syncCredentials === true) await storage.clear();
    this.credentials = { ...value, syncCredentials: value.syncCredentials === true };
    this.saveCredentials(); this.view.credentials(this.credentials);
  }
  async connect(value) {
    if (this.switchingMode || this.connecting || this.adventureBusy) throw new Error('正在处理连接，请稍后再试');
    if (this.testMode) throw new Error('测试模式不会连接 Habitica，请先关闭测试模式');
    if (!this.active) throw new Error('请在主窗口连接 Habitica');
    if (!this.progressStorage || this.engine.state.target === null) throw new Error(this.message || 'TODO 进度尚未初始化，请稍后重试');
    if (this.storageFailed) throw new Error(this.message || '进度保存已暂停，请重新启用插件');
    if (!/^[a-f0-9-]{36}$/i.test(value.userId) || !/^[a-f0-9-]{36}$/i.test(value.token)) throw new Error('请输入完整的 User ID 和 API Token');
    if (this.engine.state.account && this.engine.state.account !== value.userId) throw new Error('当前进度属于另一个 Habitica 账号；请先完成原账号结算');
    this.connecting = true;
    try {
    this.status = 'checking'; this.render();
    const client = new HabiticaClient(value), user = await client.user();
    // The alias is persistent and scoped to this SiYuan installation.
    this.engine.state.alias ||= 'gamify-siyuan-' + crypto.randomUUID();
    this.engine.state.account = value.userId;
    await this.persist();
    const habit = await client.ensureHabit(this.engine.state.alias);
    await this.saveConnection(value);
    this.client = client; this.habit = habit; this.user = user; this.content = null; this.shops = null;
    this.adventureUncertain = localStorage.getItem(this.storeKey + ':action:' + value.userId) || '';
    this.client.rememberUser(user);
    this.status = 'online'; this.message = '';
    await this.resolveRewards(); this.render(); await this.flushRewards();
    } catch (error) { this.status = this.client ? 'online' : 'offline'; this.render(); throw error; }
    finally { this.connecting = false; }
  }
  async flushRewards() {
    if (this.disposed || this.storageFailed || this.switchingMode) return;
    if (this.testMode) {
      for (const reward of this.engine.state.rewards.filter(r => r.status === 'queued')) {
        reward.status = 'sent'; this.engine.state.total++;
        this.view.rewardFeedback(1, { blockId: reward.sources?.at(-1), caret: ['editing', 'maintenance'].includes(reward.kind) });
      }
      await this.persist(); this.render(); return;
    }
    if (this.adventureBusy || this.sending || !this.client || this.disposed || this.storageFailed || Date.now() < (this.retryAfter || 0)) return;
    if (this.engine.state.rewards.some(r => ['sending', 'uncertain'].includes(r.status))) return;
    this.sending = true;
    try {
      for (const reward of this.engine.state.rewards.filter(r => r.status === 'queued')) {
        if (this.disposed) break;
        // Persist a before-counter before issuing the non-idempotent score request.
        let task;
        try { task = await this.client.task(this.engine.state.alias); }
        catch (error) { this.retryAfter = Date.now() + 60000; throw error; }
        if (task.priority !== 0.1 || task.type !== 'habit' || task.down || !task.up) throw new Error('专用习惯设置已改变，请恢复琐事难度、仅正向');
        // A fresh balance is required: the cached character may be minutes old.
        const playerBefore = await this.client.user({ fresh: true });
        reward.goldBefore = playerBefore.stats?.gp;
        reward.before = task.counterUp || 0;
        reward.historyBefore = (task.history || []).reduce((sum, item) => sum + (item.scoredUp || 0), 0);
        reward.status = 'sending'; reward.attempted = Date.now(); await this.persist();
        try {
          const stats = await this.client.score(this.engine.state.alias);
          const change = Number.isFinite(reward.goldBefore) && Number.isFinite(stats.gp) ? stats.gp - reward.goldBefore : null;
          reward.gold = change !== null && change >= 0 ? change : null;
          reward.status = 'sent'; this.engine.state.total++; await this.persist();
          if (this.user) { this.user.stats = { ...this.user.stats, ...stats }; this.client.rememberUser?.(this.user); }
          this.message = ''; this.status = 'online'; this.render();
          this.view.rewardFeedback(reward.gold, { blockId: reward.sources?.at(-1), caret: ['editing', 'maintenance'].includes(reward.kind) });
        } catch (error) {
          // A visual error or failed post-score save must never requeue a scored reward.
          if (reward.status === 'sent') throw error;
          reward.status = error.uncertain ? 'uncertain' : 'queued'; await this.persist();
          this.retryAfter = Date.now() + 60000;
          throw error;
        }
      }
    } catch (error) { this.retryAfter = Date.now() + 60000; this.status = 'waiting'; this.message = error.message + '；进度已保留'; this.render(); }
    finally { this.sending = false; }
  }
  async resolveRewards(retry = false) {
    if (this.testMode || this.switchingMode) return;
    if (!this.client || this.resolving || this.sending || this.adventureBusy) return;
    this.resolving = true;
    try {
      for (const reward of this.engine.state.rewards.filter(r => ['sending', 'uncertain'].includes(r.status))) {
        const task = await this.client.task(this.engine.state.alias);
        const history = (task.history || []).reduce((sum, item) => sum + (item.scoredUp || 0), 0);
        const counter = task.counterUp || 0;
        const sameDay = calendarDay(reward.attempted) === calendarDay();
        if (history > (reward.historyBefore ?? Infinity) || (sameDay && counter > reward.before)) {
          reward.status = 'sent'; this.engine.state.total++; this.message = '已核对，奖励领取成功';
        } else {
          // No idempotency key exists in Habitica. Never automatically resend an ambiguous mutation.
          reward.status = 'uncertain'; this.message = '领取结果尚未确认，已暂停自动重试。请先核对 Habitica 中的专用习惯。';
          if (retry && Date.now() - reward.attempted >= 60000 && globalThis.confirm('请先确认 Habitica 的「在思源完成任务」没有收到这次加分。只有确认未到账才重试；误判可能重复发奖。确定重新领取？')) {
            reward.status = 'queued'; this.retryAfter = 0; this.message = '将在下一次检查时重新领取';
          }
        }
        await this.persist();
      }
    } catch (error) { this.report(error); }
    finally { this.resolving = false; this.render(); }
  }
  async refresh() {
    if (this.switchingMode || this.refreshing || this.adventureBusy) return;
    if (this.testMode) { await this.scan(); return; }
    this.refreshing = true;
    try {
      const previousAccount = this.credentials.userId, previousToken = this.credentials.token;
      await this.restoreSharedConnection();
      if (this.client && (previousAccount !== this.credentials.userId || previousToken !== this.credentials.token)) { this.client = null; this.user = null; }
      if (this.client) { this.user = await this.client.user({ refresh: true }); await this.resolveRewards(); } else if (this.credentials.userId) await this.connect(this.credentials);
      await this.scan(); await this.loadAdventure(this.view.adventure?.page || 'home'); this.render();
    }
    catch (error) { this.report(error); }
    finally { this.refreshing = false; }
  }
  open(entry) {
    const light = Number(globalThis.siyuan?.config?.appearance?.mode) === 0;
    this.view.host.dataset.theme = light ? 'light' : 'dark'; this.view.open(entry);
    if (!this.testMode && !this.credentials.token) this.view.settings(true);
    this.render();
    if (!this.testMode && this.client) this.loadAdventure('home').catch(error => this.report(error));
  }
  render() {
    if (!this.view || !this.engine || this.disposed) return;
    const waiting = this.engine.state.rewards.some(r => r.status !== 'sent');
    this.view.update({ state: this.engine.state, user: this.testMode ? null : this.user, backlog: this.backlog, testMode: this.testMode, status: !this.active ? 'paused' : waiting ? 'waiting' : this.status, message: this.message, adventure: { content: this.content, shops: this.shops, busy: !!this.adventureBusy || !!this.sending, blocked: this.adventureUncertain ? '上次操作结果尚未确认，请在 Habitica 核对后解除暂停。' : !this.active ? '请在主窗口操作' : '', updated: this.client?.cache?.get('/user')?.at || 0 } });
    if (this.reconcileButton) { this.reconcileButton.hidden = !this.adventureUncertain; this.reconcileButton.disabled = !!this.adventureBusy || !this.active; }
    const entry = document.querySelector(`[data-type="${this.name}companion"]`);
    if (entry) {
      entry.setAttribute('aria-label', 'Gamify for SiYuan');
      entry.style.backgroundImage = '';
      entry.style.backgroundSize = '100% 2px'; entry.style.backgroundPosition = 'bottom'; entry.style.backgroundRepeat = 'no-repeat';
    }
  }

  async loadAdventure(page = 'home') {
    if (this.testMode || this.disposed || !this.client) return;
    const client = this.client;
    // Every page shares one user snapshot; repeated openings coalesce and reuse it.
    const [user, content] = await Promise.all([client.user(), client.content(this.user?.preferences?.language || 'zh')]);
    if (this.disposed || client !== this.client) return;
    this.user = user; this.content = content;
    if (page === 'shop') {
      const [market, gear, seasonal] = await Promise.all([client.shop('market'), client.shop('market-gear'), client.shop('seasonal')]);
      if (this.disposed || client !== this.client) return;
      this.shops = { market, gear, seasonal };
    }
    this.render();
  }
  async adventureAction(kind, key) {
    if (this.testMode) throw new Error('测试构建不执行真实购买或施放');
    if (this.disposed || !this.active || !this.client) throw new Error('请在已连接的主窗口操作');
    if (this.adventureBusy || this.sending || this.resolving || this.connecting || this.refreshing) throw new Error('正在同步奖励或处理请求，请稍后再试');
    if (this.adventureUncertain) throw new Error('上次操作结果尚未确认，请先在 Habitica 核对');
    if (!['cast', 'buy'].includes(kind)) throw new Error('不支持的操作');
    const client = this.client, actionKey = this.storeKey + ':action:' + this.credentials.userId;
    this.adventureBusy = true; this.render(); let submitted = false;
    try {
      await this.loadAdventure(kind === 'buy' ? 'shop' : 'home');
      const user = await client.user({ fresh: true });
      if (this.disposed || client !== this.client) throw new Error('连接已改变，请重新打开面板');
      this.user = user;
      if (kind === 'cast') {
        const spell = this.content?.spells?.[user.stats?.class]?.[key];
        if (!spell) throw new Error('当前职业没有这个技能');
        const reason = skillBlockReason(spell, user); if (reason) throw new Error(reason);
      } else {
        const item = shopItems(this.shops.market, this.shops.gear, this.shops.seasonal, this.content, user).find(i => i.key === key);
        if (!item) throw new Error('商品已变化，请重新打开商店');
        const reason = purchaseBlockReason(item, user); if (reason) throw new Error(reason);
      }
      // Persist before mutation: a timeout, app close, or reload must not silently replay a purchase.
      localStorage.setItem(actionKey, JSON.stringify({ kind, key, at: Date.now() }));
      this.adventureUncertain = 'pending'; submitted = true;
      const result = kind === 'cast' ? await client.cast(key) : await client.buy(key);
      localStorage.removeItem(actionKey); this.adventureUncertain = '';
      client.invalidateUser(); if (kind === 'buy') { client.invalidateShops(); this.shops = null; }
      try { this.user = await client.user({ fresh: true }); this.message = ''; }
      catch { this.message = '操作已成功，角色数据暂未刷新，请稍后刷新。'; }
      this.render(); return result;
    } catch (error) {
      if (submitted && !error.uncertain && this.adventureUncertain) { localStorage.removeItem(actionKey); this.adventureUncertain = ''; }
      if (submitted && error.uncertain) { client.invalidateUser(); this.adventureUncertain = 'uncertain'; throw new Error('操作结果尚未确认，请先在 Habitica 核对；不会自动重发。'); }
      throw error;
    } finally { this.adventureBusy = false; this.render(); }
  }
  async reconcileAdventure() {
    if (!this.adventureUncertain || this.adventureBusy || this.testMode || !this.active || !this.client) return;
    if (!globalThis.confirm('请先到 Habitica 核对上次购买或技能是否已生效。解除暂停不会重新发送该操作。确认已核对并解除暂停？')) return;
    this.adventureBusy = true;
    try {
      this.user = await this.client.user({ fresh: true });
      localStorage.removeItem(this.storeKey + ':action:' + this.credentials.userId); this.adventureUncertain = ''; this.client.invalidateShops(); this.shops = null; this.message = '已解除操作暂停；不会重发上次操作';
    } catch (error) { this.report(error); }
    finally { this.adventureBusy = false; this.render(); }
  }

  report(error) { this.message = error.message; this.render(); }
  readTestState() {
    try { return JSON.parse(localStorage.getItem(this.storeKey + ':testProgress') || 'null'); } catch { return null; }
  }
  makeEngine(state) {
    if (!this.testMode) return new TodoProgress(state || newProgress());
    const fresh = state || newProgress(); fresh.target = 3;
    fresh.snapshot = { day: calendarDay(), backlog: 300, target: 3 };
    this.testRows = [...new Set([...Object.keys(fresh.pending), ...fresh.credits.map(c => c.id)])].filter(id => id.startsWith('test-')).map(id => ({ id, markdown: '* [X] test' }));
    return new TodoProgress(fresh, () => crypto.randomUUID(), 3000);
  }
  /* @test-only:start */
  async testAction(action) {
    if (!this.testMode || this.switchingMode || this.disposed) return;
    if (action === 'reward') { this.view.rewardFeedback(1); return; }
    const id = 'test-' + crypto.randomUUID();
    this.testRows.push({ id, markdown: '* [X] test' });
    this.engine.localChange(id, true); this.localDirty = true;
    this.render();
    this.view.completeTodo({ ...progressPreview(this.engine.state) });
    await this.scan();
  }
  /* @test-only:end */
  onDataChanged() {
    this.storageFailed = true;
    this.message = '收到其他设备更新的进度，自动奖励已暂停；请只保留一台主设备，并重新启用插件。';
    this.render();
  }
  onunload() {
    if (this.activitySaveTimer && !this.storageFailed) this.persist().catch(() => {});
    clearTimeout(this.activitySaveTimer); this.editing?.stop();
    this.disposed = true; clearInterval(this.timer); clearTimeout(this.scanTimer);
    this.taskObserver?.disconnect();
    if (this.click) document.removeEventListener('click', this.click, true);
    if (this.dockClick) document.removeEventListener('click', this.dockClick, true);
    if (this.ws) this.eventBus.off('ws-main', this.ws);
    this.view?.destroy(); this.lockAbort?.abort(); this.releaseLock?.();
    this.mobileTaskStyle?.remove();
  }
};
