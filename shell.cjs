const { Plugin, getFrontend, toggleRightDock, showMessage } = require('siyuan');

module.exports = class GamifyForSiYuan extends Plugin {
  async onload() {
    this.disposed = false;
    if (globalThis.siyuan?.config?.readonly || globalThis.siyuan?.isPublish || document.body.classList.contains('body--settings')) return;
    this.storeKey = `gamify-for-siyuan:${globalThis.siyuan?.config?.system?.workspaceDir || location.origin}`;
    try { this.credentials = JSON.parse(localStorage.getItem(this.storeKey + ':credentials') || '{}'); }
    catch { this.credentials = {}; }
    this.view = new GamifyView({ css: PLUGIN_CSS, onConnect: value => this.connect(value), onSound: value => {
      this.credentials.sound = value; this.saveCredentials(); this.view.soundEnabled = value;
    }, onRefresh: () => this.refresh(), onResolve: retry => this.resolveRewards(retry) });
    this.view.credentials(this.credentials);
    this.message = ''; this.status = 'offline'; this.backlog = 0;
    this.addIcons('<symbol id="iconGamifyStar" viewBox="0 0 24 24"><path d="m12 2 2.8 6.2L22 11l-7.2 2.8L12 21l-2.8-7.2L2 11l7.2-2.8L12 2Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></symbol>');
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
      this.addDock({ type: 'companion', config: { position: 'RightBottom', size: { width: 0, height: 0 }, icon: 'iconGamifyStar', title: 'Gamify for SiYuan', show: false }, data: {},
        init() { queueMicrotask(() => { if (!plugin.disposed) toggleRightDock(false); }); } });
    } else {
      this.addTopBar({ icon: 'iconGamifyStar', title: 'Gamify for SiYuan', position: 'right', callback: () => this.open() });
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
      this.message = '当前环境不支持多窗口保护，自动奖励暂未启用'; this.status = 'paused';
    }
    this.engine = this.engine || new TodoProgress(); this.render();
  }

  async initializeWriter() {
    this.progressStorage = new ProgressStorage(this.name);
    const state = await this.progressStorage.read();
    if (this.disposed) return;
    this.engine = new TodoProgress(state || newProgress());
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
      if (this.disposed || this.storageFailed) return;
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
        if (added) this.view.completeTodo({ blockId: id, element: block, progress: this.engine.state.credits.length + Object.keys(this.engine.state.pending).length, target: this.engine.state.target });
      }
      if (changes.size) { this.render(); this.scheduleScan(80); }
    });
    this.taskObserver.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-task'], attributeOldValue: true });
    this.ws = event => { if (event.detail?.cmd === 'transactions') this.scheduleScan(250); };
    this.eventBus.on('ws-main', this.ws);
    await this.scan();
    this.timer = setInterval(() => {
      if (Object.keys(this.engine.state.pending).length || Date.now() - (this.lastScan || 0) > 60000) this.scan();
    }, 5000);
    if (this.credentials.userId && this.credentials.token) await this.connect(this.credentials).catch(error => this.report(error));
  }

  async requestSiYuan(path, body) {
    const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('思源暂时无法读取 TODO');
    const result = await response.json(); if (result.code !== 0) throw new Error(result.msg || 'TODO 读取失败'); return result.data;
  }
  scheduleScan(delay) { clearTimeout(this.scanTimer); this.scanTimer = setTimeout(() => this.scan(), delay); }
  async scan() {
    if (this.scanning || this.disposed || !this.active || this.storageFailed) return;
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
    try { await this.progressStorage.write(snapshot); }
    catch (error) {
      this.storageFailed = true;
      const detail = error?.message || error?.msg || '本地文件写入失败';
      throw new Error(`进度保存失败，已暂停奖励（${detail}）；请重新启用插件后重试`);
    }
  }
  saveCredentials() { localStorage.setItem(this.storeKey + ':credentials', JSON.stringify(this.credentials)); }
  async connect(value) {
    if (!this.active) throw new Error('请在主窗口连接 Habitica');
    if (!this.progressStorage || this.engine.state.target === null) throw new Error(this.message || 'TODO 进度尚未初始化，请稍后重试');
    if (this.storageFailed) throw new Error(this.message || '进度保存已暂停，请重新启用插件');
    if (!/^[a-f0-9-]{36}$/i.test(value.userId) || !/^[a-f0-9-]{36}$/i.test(value.token)) throw new Error('请输入完整的 User ID 和 API Token');
    if (this.engine.state.account && this.engine.state.account !== value.userId) throw new Error('当前进度属于另一个 Habitica 账号；请先完成原账号结算');
    this.status = 'checking'; this.render();
    const client = new HabiticaClient(value), user = await client.user();
    // The alias is persistent and scoped to this SiYuan installation.
    this.engine.state.alias ||= 'gamify-siyuan-' + crypto.randomUUID();
    this.engine.state.account = value.userId;
    await this.persist();
    const habit = await client.ensureHabit(this.engine.state.alias);
    this.client = client; this.habit = habit; this.user = user; this.credentials = value;
    this.saveCredentials(); this.view.credentials(value); this.status = 'online'; this.message = '';
    await this.resolveRewards(); this.render(); await this.flushRewards();
  }
  async flushRewards() {
    if (this.sending || !this.client || this.disposed || this.storageFailed || Date.now() < (this.retryAfter || 0)) return;
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
        const playerBefore = await this.client.user();
        reward.goldBefore = playerBefore.stats?.gp;
        reward.before = task.counterUp || 0;
        reward.historyBefore = (task.history || []).reduce((sum, item) => sum + (item.scoredUp || 0), 0);
        reward.status = 'sending'; reward.attempted = Date.now(); await this.persist();
        try {
          const stats = await this.client.score(this.engine.state.alias);
          const change = Number.isFinite(reward.goldBefore) && Number.isFinite(stats.gp) ? stats.gp - reward.goldBefore : null;
          reward.gold = change !== null && change >= 0 ? change : null;
          reward.status = 'sent'; this.engine.state.total++; await this.persist();
          if (this.user) this.user.stats = { ...this.user.stats, ...stats };
          this.message = ''; this.status = 'online'; this.render();
          this.view.rewardFeedback(reward.gold, { blockId: reward.sources?.at(-1) });
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
    if (!this.client || this.resolving || this.sending) return;
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
    try { if (this.client) { this.user = await this.client.user(); await this.resolveRewards(); } else if (this.credentials.userId) await this.connect(this.credentials); await this.scan(); this.render(); }
    catch (error) { this.report(error); }
  }
  open(entry) {
    const light = Number(globalThis.siyuan?.config?.appearance?.mode) === 0;
    this.view.host.dataset.theme = light ? 'light' : 'dark'; this.view.open(entry);
    if (!this.credentials.token) this.view.settings(true);
    this.render();
  }
  render() {
    if (!this.view || !this.engine || this.disposed) return;
    const waiting = this.engine.state.rewards.some(r => r.status !== 'sent');
    this.view.update({ state: this.engine.state, user: this.user, backlog: this.backlog, status: !this.active ? 'paused' : waiting ? 'waiting' : this.status, message: this.message });
    const entry = document.querySelector(`[data-type="${this.name}companion"]`);
    if (entry) {
      const { credits, target, pending } = this.engine.state;
      entry.setAttribute('aria-label', `Gamify for SiYuan · ${credits.length} / ${target ?? '—'}`);
      entry.style.backgroundImage = target ? `linear-gradient(to right, #a8e8c9 ${Math.min(100, credits.length / target * 100)}%, #c5acf980 0 ${Math.min(100, (credits.length + Object.keys(pending).length) / target * 100)}%, transparent 0)` : '';
      entry.style.backgroundSize = '100% 2px'; entry.style.backgroundPosition = 'bottom'; entry.style.backgroundRepeat = 'no-repeat';
    }
  }
  report(error) { this.message = error.message; this.render(); }
  onDataChanged() {
    this.storageFailed = true;
    this.message = '收到其他设备更新的进度，自动奖励已暂停；请只保留一台主设备，并重新启用插件。';
    this.render();
  }
  onunload() {
    this.disposed = true; clearInterval(this.timer); clearTimeout(this.scanTimer);
    this.taskObserver?.disconnect();
    if (this.click) document.removeEventListener('click', this.click, true);
    if (this.dockClick) document.removeEventListener('click', this.dockClick, true);
    if (this.ws) this.eventBus.off('ws-main', this.ws);
    this.view?.destroy(); this.lockAbort?.abort(); this.releaseLock?.();
  }
};
