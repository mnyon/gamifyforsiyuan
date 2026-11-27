import type { Credentials } from '../features/connection/domain/credentials.js';
import type {
  ActionStatus,
  CompanionUser,
  CompanionContent,
  ArmoireResult,
} from '../features/companion/domain/types.js';
import type {
  AdventurePage,
  AdventureSnapshot,
} from '../features/companion/presentation/AdventureView.js';
import type { ExecuteActionPorts } from '../features/companion/application/ports.js';
import type { BlockEdit, TaskRow } from '../features/progress/domain/types.js';
import type { FeedbackContext, ViewOptions } from '../presentation/types.js';
import { required, errorMessage } from '../presentation/elements.js';
import { parseProgress } from '../features/progress/adapters/progressSchema.js';
import { queryRows, taskRows, updatedRows } from '../adapters/siyuan/queryRows.js';
import { actionResult } from '../adapters/habitica/schema.js';
import { Plugin, toggleRightDock } from 'siyuan';
import { executeAction } from '../features/companion/application/executeAction.ts';
import { acknowledgeAction } from '../features/companion/application/acknowledgeAction.ts';
import { companionAction } from '../features/companion/domain/types.ts';
import { HabiticaCompanionGateway } from '../features/companion/adapters/HabiticaCompanionGateway.ts';
import { LocalActionJournal } from '../features/companion/adapters/LocalActionJournal.ts';
import { ProgressWriter } from '../features/progress/application/persistence.ts';
import {
  restoreConnection,
  saveConnection,
} from '../features/connection/application/manageConnection.ts';
import { LocalCredentialsRepository } from '../features/connection/adapters/LocalCredentialsRepository.ts';
import { requireCredentials } from '../features/connection/domain/credentials.ts';
import { settleRewards } from '../features/progress/application/settleRewards.ts';
import { reconcileRewards } from '../features/progress/application/reconcileRewards.ts';
import { HabiticaRewardGateway } from '../features/progress/adapters/HabiticaRewardGateway.ts';
import { GamifyView } from '../presentation/GamifyView.ts';
import { PLUGIN_CSS } from './styles.ts';
import { isMobileFrontend, supportsWebLocks, applyMobileTaskQuirk } from './platform.ts';
import { HABITICA_ICON } from '../presentation/icon.ts';
import {
  TodoProgress,
  newProgress,
  taskDone,
  calendarDay,
  progressPreview,
} from '../features/progress/domain/TodoProgress.ts';
import { ActivityProgress, editingApproach } from '../features/progress/domain/ActivityProgress.ts';
import { EditTracker } from '../features/progress/presentation/EditTracker.ts';
import { HabiticaClient } from '../adapters/habitica/HabiticaClient.ts';
import { HabiticaError } from '../adapters/habitica/HabiticaError.ts';
import { RewardAuditLog } from '../features/progress/adapters/RewardAuditLog.ts';
import { SiYuanProgressRepository as ProgressStorage } from '../features/progress/adapters/SiYuanProgressRepository.ts';
import { SiYuanConnectionRepository as ConnectionStorage } from '../features/connection/adapters/SiYuanConnectionRepository.ts';

export default class GamifyForSiYuan extends Plugin {
  disposed = false;
  storeKey = '';
  localCredentials?: LocalCredentialsRepository;
  credentials: Credentials = {};
  testMode = false;
  isMobile = false;
  view!: GamifyView;
  reconcileButton?: HTMLButtonElement;
  mobileTaskStyle?: HTMLStyleElement;
  message = '';
  status = 'offline';
  active = false;
  storageFailed = false;
  switchingMode = false;
  connecting = false;
  adventureBusy = false;
  sending = false;
  resolving = false;
  refreshing = false;
  scanning = false;
  localDirty = false;
  adventureUncertain: ActionStatus = '';
  engine!: TodoProgress;
  activity!: ActivityProgress;
  progressStorage?: ProgressStorage;
  progressWriter?: ProgressWriter;
  audit?: RewardAuditLog;
  editing?: EditTracker;
  client: HabiticaClient | null = null;
  user: CompanionUser | null = null;
  content: CompanionContent | null = null;
  shops: AdventureSnapshot['shops'] = null;
  habit?: Awaited<ReturnType<HabiticaClient['ensureHabit']>>;
  lockAbort?: AbortController;
  releaseLock?: () => void;
  taskObserver?: MutationObserver;
  observedClicks = new Map<string, FeedbackContext & { at: number; feedbacked?: boolean }>();
  localTasks = new Map<string, { done: boolean; at: number }>();
  click?: (event: MouseEvent) => void;
  dockClick?: (event: MouseEvent) => void;
  ws?: (event: CustomEvent<{ cmd?: string }>) => void;
  timer?: ReturnType<typeof setInterval>;
  queueTimer?: ReturnType<typeof setInterval>;
  queueRetryAt = 0;
  queueAttempts = 0;
  autoRetryBlocked = false;
  lastReconcileMessage = '';
  scanTimer?: ReturnType<typeof setTimeout>;
  activitySaveTimer?: ReturnType<typeof setTimeout>;
  lastScan = 0;
  lastMaintenanceEffect = 0;
  retryAfter = 0;
  testRows: TaskRow[] = [];
  createView(options: ViewOptions): GamifyView {
    return new GamifyView(options);
  }
  async onload() {
    this.disposed = false;
    if (
      globalThis.siyuan?.config?.readonly ||
      globalThis.siyuan?.isPublish ||
      document.body.classList.contains('body--settings')
    )
      return;
    this.storeKey = `gamify-for-siyuan:${globalThis.siyuan?.config?.system?.workspaceDir || location.origin}`;
    this.localCredentials = new LocalCredentialsRepository(this.storeKey);
    this.credentials = this.localCredentials.read();
    this.testMode = TEST_BUILD;
    this.isMobile = isMobileFrontend();
    this.view = this.createView({
      css: PLUGIN_CSS,
      onConnect: (value) => this.connect(value),
      onSound: (value) => {
        this.credentials.sound = value;
        this.saveCredentials();
        this.view.soundEnabled = value;
      },
      onAdventureLoad: (page) => this.loadAdventure(page),
      onAdventureAction: (kind, key) => this.adventureAction(kind, key),
    });
    this.view.credentials(this.credentials);
    const reconcile = document.createElement('button');
    reconcile.className = 'action-reconcile';
    reconcile.textContent = '已在 Habitica 核对，解除操作暂停';
    reconcile.hidden = true;
    reconcile.onclick = () => this.reconcileAdventure();
    required(this.view.root, '.dashboard').append(reconcile);
    this.reconcileButton = reconcile;
    this.view.host.classList.toggle('mobile', this.isMobile);
    if (this.isMobile) this.mobileTaskStyle = applyMobileTaskQuirk();
    this.message = '';
    this.status = 'offline';
    this.addIcons(
      HABITICA_ICON.replace('<svg ', '<symbol id="iconGamifyHabitica" ').replace(
        '</svg>',
        '</symbol>',
      ),
    );
    if (!this.isMobile) {
      this.dockClick = (event) => {
        const entry = (event.target instanceof Element ? event.target : null)?.closest<HTMLElement>(
          '.dock__item',
        );
        if (entry?.getAttribute('data-type') !== this.name + 'companion' || event.button > 0)
          return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (this.view.card.hidden) this.open(entry);
        else this.view.close();
      };
      document.addEventListener('click', this.dockClick, true);
      const plugin = this;
      this.addDock({
        type: 'companion',
        config: {
          position: 'RightBottom',
          size: { width: 0, height: 0 },
          icon: 'iconGamifyHabitica',
          title: 'Gamify for SiYuan',
          show: false,
        },
        data: {},
        init() {
          queueMicrotask(() => {
            if (!plugin.disposed) toggleRightDock(false);
          });
        },
      });
    } else {
      this.addTopBar({
        icon: 'iconGamifyHabitica',
        title: 'Gamify for SiYuan',
        position: 'right',
        callback: () => this.open(),
      });
    }
    this.setting = {
      open: () => {
        this.open();
        this.view.settings(true);
      },
    };
    // One writer per local workspace/browser profile. Other windows only display.
    this.lockAbort = new AbortController();
    if (supportsWebLocks()) {
      navigator.locks
        .request(this.storeKey + ':writer', { signal: this.lockAbort.signal }, async () => {
          if (this.disposed) return;
          this.active = true;
          try {
            await this.initializeWriter();
            await new Promise<void>((resolve) => {
              this.releaseLock = resolve;
              if (this.disposed) resolve();
            });
          } catch (error) {
            this.message = errorMessage(error);
            this.status = 'waiting';
            this.render();
          }
        })
        .catch((error) => {
          if (!(error instanceof Error && error.name === 'AbortError')) this.report(error);
        });
    } else {
      // Mobile SiYuan normally has one active app window and some WebViews do not
      // expose Web Locks. Keep the mobile plugin usable while retaining the lock
      // protection whenever the runtime provides it.
      this.active = true;
      this.initializeWriter().catch((error) => {
        this.message = errorMessage(error);
        this.status = 'waiting';
        this.render();
      });
    }
    this.engine = this.engine || new TodoProgress();
    this.render();
  }

  async initializeWriter() {
    this.progressStorage = new ProgressStorage(this.name);
    this.audit = new RewardAuditLog(this.name);
    if (!this.testMode) {
      await this.audit.load();
      try {
        await this.restoreSharedConnection();
      } catch (error) {
        this.audit?.record({
          at: Date.now(),
          kind: 'connection',
          action: 'shared-credentials-failed',
          message: errorMessage(error),
        });
      }
    }
    const state = this.testMode ? this.readTestState() : await this.progressStorage.read();
    if (this.disposed) return;
    this.engine = this.makeEngine(state);
    this.activity = new ActivityProgress(this.engine.state);
    this.activity.day();
    this.editing = new EditTracker({
      lookup: (ids) =>
        this.requestSiYuan('/api/query/sql', {
          stmt: `SELECT id, updated FROM blocks WHERE id IN (${ids.map((id) => `'${id}'`).join(',')}) LIMIT 200`,
        }).then(updatedRows),
      onEdit: (edits, now) => this.recordEdits(edits, now),
      onError: (error) => this.report(error),
    });
    this.editing.start();
    this.observedClicks = new Map();
    this.localTasks = new Map();
    this.click = (event) => {
      if (!event.isTrusted) return;
      const action = (event.target instanceof Element ? event.target : null)?.closest<HTMLElement>(
        '.protyle-action--task',
      );
      const block = action?.closest<HTMLElement>('[data-node-id][data-subtype="t"]');
      if (!block?.dataset.nodeId) return;
      const context = {
        point: { x: event.clientX, y: event.clientY },
        at: Date.now(),
        element: block,
        blockId: block.dataset.nodeId,
      };
      this.observedClicks.set(block.dataset.nodeId, context);
      this.view.unlockSound();
      this.scheduleScan(180);
    };
    document.addEventListener('click', this.click, true);
    this.taskObserver = new MutationObserver((records) => {
      if (this.disposed || this.storageFailed || this.switchingMode) return;
      const changes = new Map<string, { block: HTMLElement; before: boolean }>();
      for (const record of records) {
        const block = record.target;
        if (!(block instanceof HTMLElement)) continue;
        if (!block.matches?.('.protyle-wysiwyg [data-type="NodeListItem"][data-subtype="t"]'))
          continue;
        const id = block.dataset.nodeId;
        if (!id) continue;
        if (!changes.has(id))
          changes.set(id, { block, before: String(record.oldValue || ' ').toUpperCase() === 'X' });
      }
      for (const [id, { block, before }] of changes) {
        const done = String(block.getAttribute('data-task') || ' ').toUpperCase() === 'X';
        if (done === before) continue;
        this.localTasks.set(id, { done, at: Date.now() });
        const added = this.engine.localChange(id, done);
        this.localDirty = true;
        if (added)
          this.view.completeTodo({
            blockId: id,
            element: block,
            ...progressPreview(this.engine.state),
          });
        else if (!done) this.view.cancelTodo(id);
      }
      if (changes.size) {
        this.render();
        this.scheduleScan(80);
      }
    });
    this.taskObserver.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ['data-task'],
      attributeOldValue: true,
    });
    this.ws = (event) => {
      if (event.detail?.cmd === 'transactions') this.scheduleScan(250);
    };
    this.eventBus.on('ws-main', this.ws);
    await this.scan();
    this.timer = setInterval(() => {
      const elapsed = Date.now() - (this.lastScan || 0);
      this.editing?.prefetch();
      if (
        (Object.keys(this.engine.state.pending).length &&
          elapsed >= (this.testMode ? 1000 : 5000)) ||
        elapsed > 60000
      )
        this.scan();
    }, 1000);
    this.startQueueTimer();
    if (!this.testMode && this.credentials.userId && this.credentials.token)
      await this.connect(this.credentials).catch((error) => this.report(error));
  }

  async requestSiYuan(path: string, body: object) {
    return queryRows(path, body);
  }
  scheduleScan(delay: number) {
    clearTimeout(this.scanTimer);
    this.scanTimer = setTimeout(() => this.scan(), delay);
  }
  async scan() {
    if (this.scanning || this.switchingMode || this.disposed || !this.active || this.storageFailed)
      return;
    this.scanning = true;
    try {
      // Keyset pagination avoids SiYuan's default SQL result cap.
      let last = '';
      const rows: TaskRow[] = [];
      for (;;) {
        const page = taskRows(
          await this.requestSiYuan('/api/query/sql', {
            stmt: `SELECT id, substr(markdown, 1, instr(markdown || char(10), char(10))-1) AS markdown FROM blocks WHERE type = 'i' AND subtype = 't' AND id > '${last}' ORDER BY id LIMIT 1000`,
          }),
        );
        if (!Array.isArray(page)) throw new Error('TODO 查询结果不正确');
        rows.push(...page);
        if (!page.length) break;
        last = page.at(-1)!.id;
        if (!/^\d{14}-[a-z0-9]{7}$/.test(last)) throw new Error('TODO 标识不正确');
      }
      if (this.disposed) return;
      if (this.testMode) rows.push(...(this.testRows || []));
      // The editor is current; SQL indexing may still contain the previous toggle.
      const byId = new Map(rows.map((row) => [row.id, row]));
      for (const [id, local] of this.localTasks || []) {
        const row = byId.get(id);
        if (row && taskDone(row.markdown) === local.done) {
          this.localTasks.delete(id);
          continue;
        }
        if (Date.now() - local.at > 30000) {
          this.localTasks.delete(id);
          continue;
        }
        if (row) row.markdown = local.done ? '* [X]' : '* [ ]';
        else rows.push({ id, markdown: local.done ? '* [X]' : '* [ ]' });
      }
      for (const block of document.querySelectorAll<HTMLElement>(
        '.protyle-wysiwyg [data-type="NodeListItem"][data-subtype="t"][data-task]',
      )) {
        const row = byId.get(block.dataset.nodeId || '');
        if (row)
          row.markdown =
            String(block.getAttribute('data-task')).toUpperCase() === 'X' ? '* [X]' : '* [ ]';
      }
      this.lastScan = Date.now();
      const before = JSON.stringify(this.engine.state);
      if (this.testMode)
        this.engine.state.snapshot = { day: calendarDay(), backlog: 300, target: 3 };
      const result = this.engine.observe(rows);
      if (before !== JSON.stringify(this.engine.state) || this.localDirty) await this.persist();
      this.localDirty = false;
      for (const id of result.completed) {
        const context = this.observedClicks.get(id);
        if (!context?.feedbacked)
          this.view.completeTodo(
            context && Date.now() - context.at < 15000 ? context : { blockId: id },
          );
        this.observedClicks.delete(id);
      }
      for (const [id, context] of this.observedClicks)
        if (Date.now() - context.at > 15000) this.observedClicks.delete(id);
      this.render();
      await this.flushRewards();
    } catch (error) {
      this.report(error);
    } finally {
      this.scanning = false;
    }
  }
  async persist() {
    if (this.testMode) {
      localStorage.setItem(this.storeKey + ':testProgress', JSON.stringify(this.engine.state));
      return;
    }
    this.progressWriter ||= new ProgressWriter({
      write: (snapshot) =>
        this.progressStorage
          ? this.progressStorage.write(snapshot)
          : Promise.reject(new Error('进度尚未初始化')),
    });
    if (this.storageFailed) this.progressWriter.stop();
    try {
      await this.progressWriter.save(this.engine.state);
    } catch (error) {
      this.storageFailed = true;
      throw error;
    }
  }
  credentialsRepository() {
    return (this.localCredentials ||= new LocalCredentialsRepository(this.storeKey));
  }
  saveCredentials() {
    this.credentialsRepository().write(this.credentials);
  }
  recordEdits(edits: BlockEdit[], now: number) {
    if (this.disposed || this.storageFailed || !this.active) return;
    for (const edit of edits) {
      const result = this.activity.record(edit, now);
      if (result.maintenance > 0 && now - (this.lastMaintenanceEffect || 0) > 1500) {
        this.lastMaintenanceEffect = now;
        this.view.maintainBlock({ blockId: edit.id, weight: result.weight });
      }
    }
    if (edits.some((edit) => (edit.inserted || 0) + (edit.deleted || 0) > 0)) {
      this.view.editingFeedback({
        blockId: edits.at(-1)!.id,
        progress: editingApproach(this.engine.state, now),
      });
    }
    this.view.unlockSound();
    clearTimeout(this.activitySaveTimer);
    this.activitySaveTimer = setTimeout(async () => {
      try {
        await this.persist();
        await this.flushRewards();
        this.render();
      } catch (error) {
        this.report(error);
      }
    }, 350);
  }
  async restoreSharedConnection() {
    if (this.testMode) return false;
    const result = await restoreConnection({
      current: this.credentials,
      shared: new ConnectionStorage(this.name),
      local: this.credentialsRepository(),
    });
    if (result.credentials !== this.credentials) {
      this.credentials = result.credentials;
      this.view.credentials(this.credentials);
    }
    return result.restored;
  }
  async saveConnection(value: Credentials) {
    if (this.testMode) return;
    this.credentials = await saveConnection(
      {
        current: this.credentials,
        shared: new ConnectionStorage(this.name),
        local: this.credentialsRepository(),
      },
      value,
    );
    this.view.credentials(this.credentials);
  }
  async connect(value: Credentials) {
    if (this.switchingMode || this.connecting || this.adventureBusy)
      throw new Error('正在处理连接，请稍后再试');
    if (this.testMode) throw new Error('测试模式不会连接 Habitica，请先关闭测试模式');
    if (!this.active) throw new Error('请在主窗口连接 Habitica');
    if (!this.progressStorage || this.engine.state.target === null)
      throw new Error(this.message || 'TODO 进度尚未初始化，请稍后重试');
    if (this.storageFailed) throw new Error(this.message || '进度保存已暂停，请重新启用插件');
    requireCredentials(value);
    if (this.engine.state.account && this.engine.state.account !== value.userId)
      throw new Error('当前进度属于另一个 Habitica 账号；请先完成原账号结算');
    this.connecting = true;
    try {
      this.status = 'checking';
      this.render();
      const client = new HabiticaClient(value),
        user = await client.user();
      // The alias is persistent and scoped to this SiYuan installation.
      this.engine.state.alias ||= 'gamify-siyuan-' + crypto.randomUUID();
      this.engine.state.account = value.userId;
      await this.persist();
      const habit = await client.ensureHabit(this.engine.state.alias);
      await this.saveConnection(value);
      this.client = client;
      this.habit = habit;
      this.user = user;
      this.content = null;
      this.shops = null;
      this.warmAdventure();
      this.adventureUncertain = new LocalActionJournal(this.storeKey, value.userId).hasPending()
        ? 'pending'
        : '';
      this.client.rememberUser(user);
      this.status = 'online';
      this.message = '';
      this.queueAttempts = 0;
      this.queueRetryAt = 0;
      this.autoRetryBlocked = false;
      this.audit?.record({ at: Date.now(), kind: 'connection', action: 'connected' });
      await this.resolveRewards();
      this.render();
      await this.flushRewards();
    } catch (error) {
      this.status = this.client ? 'online' : 'offline';
      this.audit?.record({
        at: Date.now(),
        kind: 'connection',
        action: 'connect-failed',
        message: errorMessage(error),
      });
      this.render();
      throw error;
    } finally {
      this.connecting = false;
    }
  }
  async flushRewards() {
    if (this.disposed || this.storageFailed || this.switchingMode) return;
    if (this.testMode) {
      for (const reward of this.engine.state.rewards.filter((r) => r.status === 'queued')) {
        reward.status = 'sent';
        this.engine.state.total++;
        this.view.rewardFeedback(1, {
          blockId: reward.sources?.at(-1),
          caret: ['editing', 'maintenance'].includes(reward.kind || ''),
          maintenance: reward.kind === 'maintenance',
        });
      }
      await this.persist();
      this.render();
      return;
    }
    if (
      this.adventureBusy ||
      this.sending ||
      !this.client ||
      this.disposed ||
      this.storageFailed ||
      Date.now() < (this.retryAfter || 0)
    )
      return;
    if (this.engine.state.rewards.some((r) => ['sending', 'uncertain'].includes(r.status))) return;
    this.sending = true;
    const before = this.rewardStatuses();
    let failure: unknown;
    try {
      await settleRewards({
        state: this.engine.state,
        gateway: new HabiticaRewardGateway(this.client),
        save: () => this.persist(),
        now: () => Date.now(),
        shouldStop: () => this.disposed,
        onSettled: (reward, stats) => {
          if (this.user) {
            this.user.stats = { ...this.user.stats, ...stats };
            this.client?.rememberUser?.(this.user);
          }
          this.message = '';
          this.status = 'online';
          this.render();
          this.view.rewardFeedback(reward.gold, {
            blockId: reward.sources?.at(-1),
            caret: ['editing', 'maintenance'].includes(reward.kind || ''),
            maintenance: reward.kind === 'maintenance',
          });
        },
      });
    } catch (error) {
      failure = error;
      this.retryAfter = Date.now() + 60000;
      this.status = 'waiting';
      if (!(error instanceof HabiticaError)) {
        this.message = `${errorMessage(error)}；进度已保留`;
      }
    } finally {
      this.auditTransitions(before, failure);
      this.sending = false;
      this.render();
    }
  }
  async resolveRewards(retry = false) {
    if (this.testMode || this.switchingMode) return;
    if (!this.client || this.resolving || this.sending || this.adventureBusy) return;
    this.resolving = true;
    const before = this.rewardStatuses();
    let failure: unknown;
    try {
      await reconcileRewards({
        state: this.engine.state,
        gateway: new HabiticaRewardGateway(this.client),
        save: () => this.persist(),
        now: () => Date.now(),
        requestRetry: retry,
        confirmRetry: () =>
          globalThis.confirm(
            '请先确认 Habitica 的「在思源完成任务」没有收到这次加分。只有确认未到账才重试；误判可能重复发奖。确定重新领取？',
          ),
        onMessage: (message) => {
          if (message === this.lastReconcileMessage) return;
          this.lastReconcileMessage = message;
          this.audit?.record({
            at: Date.now(),
            kind: 'reward',
            action: 'reconcile',
            message,
          });
        },
        onRetryQueued: () => {
          this.retryAfter = 0;
        },
      });
    } catch (error) {
      failure = error;
      this.report(error);
    } finally {
      this.auditTransitions(before, failure);
      this.resolving = false;
      this.render();
    }
  }
  startQueueTimer() {
    clearInterval(this.queueTimer);
    this.queueTimer = setInterval(() => {
      void this.drainQueue();
    }, 60000);
  }
  rewardStatuses(): Map<string, string> {
    return new Map(this.engine.state.rewards.map((reward) => [reward.id, reward.status]));
  }
  auditTransitions(before: Map<string, string>, failure?: unknown) {
    if (!this.audit || !this.engine) return;
    const message = failure === undefined ? undefined : errorMessage(failure);
    for (const reward of this.engine.state.rewards) {
      const from = before.get(reward.id);
      if (from === reward.status) continue;
      this.audit.record({
        at: Date.now(),
        kind: 'reward',
        action:
          reward.status === 'sent'
            ? 'sent'
            : reward.status === 'uncertain'
              ? 'uncertain'
              : 'status',
        rewardId: reward.id,
        from,
        to: reward.status,
        count: reward.count,
        gold: reward.gold ?? null,
        message,
      });
    }
  }
  async drainQueue() {
    if (
      this.disposed ||
      !this.active ||
      !this.engine ||
      this.testMode ||
      this.storageFailed ||
      this.switchingMode ||
      this.connecting ||
      this.sending ||
      this.resolving ||
      this.refreshing ||
      this.adventureBusy
    )
      return;
    if (!this.engine.state.rewards.some((reward) => reward.status !== 'sent')) {
      this.queueAttempts = 0;
      this.queueRetryAt = 0;
      return;
    }
    try {
      if (this.client) {
        const unresolved = this.engine.state.rewards.some(
          (reward) => reward.status === 'sending' || reward.status === 'uncertain',
        );
        if (unresolved && Date.now() < this.queueRetryAt) return;
        await this.resolveRewards();
        if (unresolved) {
          this.queueRetryAt = Date.now() + 10 * 60000;
        }
        await this.flushRewards();
        return;
      }
      if (this.autoRetryBlocked) return;
      if (!this.credentials.userId || !this.credentials.token) return;
      if (Date.now() < this.queueRetryAt) return;
      await this.connect(this.credentials);
    } catch (error) {
      const message =
        typeof error === 'object' &&
        error !== null &&
        typeof (error as { message?: unknown }).message === 'string'
          ? (error as { message: string }).message
          : '暂时无法完成操作';
      if (/User ID 或 API Token/.test(message)) {
        this.autoRetryBlocked = true;
        return;
      }
      this.queueAttempts++;
      const delay = [60, 120, 300, 600][Math.min(this.queueAttempts - 1, 3)] ?? 600;
      this.queueRetryAt = Date.now() + delay * 1000;
      this.audit?.record({
        at: Date.now(),
        kind: 'connection',
        action: 'reconnect-backoff',
        message,
      });
    }
  }
  async refresh() {
    if (this.switchingMode || this.refreshing || this.adventureBusy) return;
    if (this.testMode) {
      await this.scan();
      return;
    }
    this.refreshing = true;
    try {
      const previousAccount = this.credentials.userId,
        previousToken = this.credentials.token;
      await this.restoreSharedConnection();
      if (
        this.client &&
        (previousAccount !== this.credentials.userId || previousToken !== this.credentials.token)
      ) {
        this.client = null;
        this.user = null;
      }
      if (this.client) {
        this.user = await this.client.user({ refresh: true });
        await this.resolveRewards();
      } else if (this.credentials.userId) await this.connect(this.credentials);
      await this.scan();
      await this.loadAdventure(this.view.adventure?.page || 'home');
      this.render();
    } catch (error) {
      this.report(error);
    } finally {
      this.refreshing = false;
    }
  }
  open(entry?: HTMLElement) {
    const light = Number(globalThis.siyuan?.config?.appearance?.mode) === 0;
    this.view.host.dataset.theme = light ? 'light' : 'dark';
    this.view.open(entry);
    if (!this.testMode && !this.credentials.token) this.view.settings(true);
    this.render();
    if (!this.testMode && this.client)
      this.loadAdventure('home').catch((error) => this.report(error));
  }
  render() {
    if (!this.view || !this.engine || this.disposed) return;
    this.view.update({
      state: this.engine.state,
      user: this.testMode ? null : this.user,
      testMode: this.testMode,
      message: this.message,
      adventure: {
        content: this.content,
        shops: this.shops,
        busy: !!this.adventureBusy || !!this.sending,
        blocked: this.adventureUncertain
          ? '上次操作结果尚未确认，请在 Habitica 核对后解除暂停。'
          : !this.active
            ? '请在主窗口操作'
            : '',
      },
    });
    if (this.reconcileButton) {
      this.reconcileButton.hidden = !this.adventureUncertain;
      this.reconcileButton.disabled = !!this.adventureBusy || !this.active;
    }
    const entry = document.querySelector<HTMLElement>(`[data-type="${this.name}companion"]`);
    if (entry) {
      entry.setAttribute('aria-label', 'Gamify for SiYuan');
      entry.style.backgroundImage = '';
      entry.style.backgroundSize = '100% 2px';
      entry.style.backgroundPosition = 'bottom';
      entry.style.backgroundRepeat = 'no-repeat';
    }
  }

  async loadAdventure(page: AdventurePage = 'home') {
    if (this.testMode || this.disposed || !this.client) return;
    const client = this.client,
      locale = this.user?.preferences?.language || 'zh';
    // Content and the user snapshot arrive independently: the catalog is often
    // already on disk, so paint skills before /user has answered.
    let failure: unknown;
    const keep = (error: unknown) => {
      failure ??= error;
    };
    const content = client.content(locale).then((value) => {
      if (this.disposed || client !== this.client) return;
      this.content = value;
      this.render();
    }, keep);
    const user = client.user().then((value) => {
      if (this.disposed || client !== this.client) return;
      this.user = value;
      this.render();
    }, keep);
    await Promise.all([content, user]);
    if (this.disposed || client !== this.client) return;
    if (page === 'shop')
      try {
        const [market, gear, seasonal] = await Promise.all([
          client.shop('market'),
          client.shop('market-gear'),
          client.shop('seasonal'),
        ]);
        if (this.disposed || client !== this.client) return;
        this.shops = { market, gear, seasonal };
        this.render();
      } catch (error) {
        keep(error);
      }
    if (failure) throw failure;
  }
  /** Prefetch the catalog after connecting so the skill list is ready when opened. */
  warmAdventure() {
    if (this.testMode || this.disposed || !this.client || this.content) return;
    const client = this.client,
      locale = this.user?.preferences?.language || 'zh';
    client.content(locale).then(
      (content) => {
        if (this.disposed || client !== this.client || this.content) return;
        this.content = content;
        this.render();
      },
      () => {
        /* Panels retry on their own; a failed warm-up is not user-visible. */
      },
    );
  }
  companionPorts(client: HabiticaClient): ExecuteActionPorts {
    const account = this.credentials.userId;
    if (!account) throw new Error('Habitica 账号尚未连接');
    const isCurrent = () =>
      !this.disposed && client === this.client && account === this.credentials.userId;
    return {
      gateway: new HabiticaCompanionGateway(client, async (kind) => {
        await this.loadAdventure(kind === 'buy' ? 'shop' : 'home');
        return { content: this.content, shops: this.shops };
      }),
      journal: new LocalActionJournal(this.storeKey, account),
      isCurrent,
      now: () => Date.now(),
      onUser: (user) => {
        if (isCurrent()) this.user = user;
      },
      onStatus: (status) => {
        if (isCurrent()) this.adventureUncertain = status;
      },
      onShopsInvalidated: () => {
        if (isCurrent()) this.shops = null;
      },
    };
  }
  async adventureAction(
    kind: 'buy' | 'cast' | 'equip',
    key: string,
  ): Promise<ArmoireResult | void> {
    if (this.testMode) throw new Error('测试构建不执行真实购买、施放或装备');
    if (this.disposed || !this.active || !this.client) throw new Error('请在已连接的主窗口操作');
    if (this.adventureBusy || this.sending || this.resolving || this.connecting || this.refreshing)
      throw new Error('正在同步奖励或处理请求，请稍后再试');
    if (this.adventureUncertain) throw new Error('上次操作结果尚未确认，请先在 Habitica 核对');
    const action = companionAction(kind, key);
    const ports = this.companionPorts(this.client);
    this.adventureBusy = true;
    this.render();
    try {
      const outcome = await executeAction(action, ports);
      if (ports.isCurrent()) this.message = outcome.message;
      return outcome.result === undefined ? undefined : actionResult(outcome.result);
    } finally {
      this.adventureBusy = false;
      this.render();
    }
  }
  async reconcileAdventure() {
    if (
      !this.adventureUncertain ||
      this.adventureBusy ||
      this.testMode ||
      this.disposed ||
      !this.active ||
      !this.client ||
      this.sending ||
      this.resolving ||
      this.connecting ||
      this.refreshing
    )
      return;
    const confirmed = globalThis.confirm(
      '请先到 Habitica 核对上次购买、技能或装备是否已生效。解除暂停不会重新发送该操作。确认已核对并解除暂停？',
    );
    if (!confirmed) return;
    const ports = this.companionPorts(this.client);
    this.adventureBusy = true;
    try {
      if (await acknowledgeAction(confirmed, ports))
        this.message = '已解除操作暂停；不会重发上次操作';
    } catch (error) {
      this.report(error);
    } finally {
      this.adventureBusy = false;
      this.render();
    }
  }

  report(error: unknown) {
    const message = errorMessage(error);
    this.audit?.record({
      at: Date.now(),
      kind: error instanceof HabiticaError ? 'connection' : 'reward',
      action: 'error',
      message,
    });
    if (!(error instanceof HabiticaError)) this.message = message;
    this.render();
  }
  readTestState() {
    try {
      const value: unknown = JSON.parse(
        localStorage.getItem(this.storeKey + ':testProgress') || 'null',
      );
      return value;
    } catch {
      return null;
    }
  }
  makeEngine(state: unknown) {
    if (!this.testMode) return new TodoProgress(state ? parseProgress(state) : newProgress());
    const fresh = state ? parseProgress(state) : newProgress();
    fresh.target = 3;
    fresh.snapshot = { day: calendarDay(), backlog: 300, target: 3 };
    this.testRows = [...new Set([...Object.keys(fresh.pending), ...fresh.credits.map((c) => c.id)])]
      .filter((id) => id.startsWith('test-'))
      .map((id) => ({ id, markdown: '* [X] test' }));
    return new TodoProgress(fresh, () => crypto.randomUUID(), 3000);
  }
  onDataChanged() {
    this.storageFailed = true;
    this.message = '收到其他设备更新的进度，自动奖励已暂停；请只保留一台主设备，并重新启用插件。';
    this.progressWriter?.stop(new Error(this.message));
    this.render();
  }
  onunload() {
    if (this.activitySaveTimer && !this.storageFailed) this.persist().catch(() => {});
    clearTimeout(this.activitySaveTimer);
    this.editing?.stop();
    this.disposed = true;
    clearInterval(this.timer);
    clearInterval(this.queueTimer);
    clearTimeout(this.scanTimer);
    void this.audit?.flush();
    this.taskObserver?.disconnect();
    if (this.click) document.removeEventListener('click', this.click, true);
    if (this.dockClick) document.removeEventListener('click', this.dockClick, true);
    if (this.ws) this.eventBus.off('ws-main', this.ws);
    this.view?.destroy();
    this.lockAbort?.abort();
    this.releaseLock?.();
    this.mobileTaskStyle?.remove();
  }
}
