# Gamify for SiYuan · Documentation

Complete TODOs in SiYuan. Watch your Habitica character grow, one small step at a time.

On desktop the character card opens from the bottom-right Habitica icon. On mobile it opens from the top bar as a full-width bottom sheet with touch-sized controls and safe-area spacing. The same TODO progress, inline feedback, sounds, reward effects, and Habitica connection are available on both layouts; the mobile layout avoids relying on the desktop dock or keyboard focus.

## 快速开始

安装正式包后，点击思源右下角 Habitica 图标，在设置中填写 User ID 和 API Token。完成标准 TODO 后立即显示待确认进度，保持勾选 60 秒后计入；达到目标自动领取奖励。取消勾选会撤回尚未结算的贡献，多出的贡献进入下一轮。每轮目标约为每日未完成 TODO 数量的 1%，至少 1 项。

角色卡显示当前形象、生命值、金币和奖励进度。具体金币及经验等收益由 Habitica 计算。当前功能不需要源时记。

A bottom-right dock icon opens a compact character card with your actual costume, level, HP, gold and reward progress. Completion adds a sweep, animated check and floating text at the actual TODO line, with a gentle chime. Separate overlays follow scrolling and never alter note content. Successful rewards show the actual balance increase; gold coins burst outward and collect at the gold counter or dock. If a balance is unavailable, only a generic reward confirmation is shown. Dark/light themes and reduced motion are supported.

## Reward rules

- The first scan establishes a baseline. Previously completed TODOs do not earn rewards.
- Each local day snapshots the unfinished TODO count. A round requires `max(1, ceil(unfinished / 100))` completions.
- The current round's target and progress survive midnight and restarts. After a round ends, the next round uses today's snapshot target.
- Checking an existing TODO starts a 60-second confirmation. Unchecking or deleting it cancels the confirmation or withdraws unspent progress. Rechecking restores an unspent contribution after confirmation.
- Each block can contribute to at most one reward per local day; it can contribute again on a later day after reopening and completing it.
- Reaching the target reserves a reward. Reserved rewards are not revoked by later unchecking; no gold or HP is deducted.
- One dedicated positive Habitica Habit named **在思源完成任务** is created at trivial difficulty (`priority: 0.1`). It stays visible in Habitica. Do not manually score it or change its settings.
- Habitica calculates rewards, including possible experience, mana, drops and quest progress. This plugin cannot promise a fixed gold amount or gold-only rewards.
- Offline progress is retained. Ambiguous score results are never automatically retried; use the card's reconciliation action. A manual retry requires confirming that the reward did not arrive.

## Install and connect

Build, then copy `dist/gamify-for-siyuan` into your workspace's `data/plugins/` directory. Reload SiYuan and enable the plugin. Open the bottom-right Habitica icon and enter Habitica User ID and API Token. Connecting creates the dedicated Habit; connection itself does not score it. Mobile uses a top-bar entry. For updates, disable the plugin, replace its files, and re-enable it. Existing progress is preserved.

Credentials stay in this device's browser storage by default. The optional **随思源同步连接信息** checkbox saves User ID and API Token in plaintext at `data/storage/petal/gamify-for-siyuan/connection.json`, so other devices in the same synced workspace can reuse them. Enable it on the desktop and click **连接并保存**, sync SiYuan on both devices, then reload the mobile plugin or tap Refresh. Existing local-only account settings are not silently replaced. Uncheck and save to remove credentials from the shared file; copies already cached on other devices, sync history and backups may remain. Turning sharing off does not revoke the Habitica token. Credentials are never committed to source or bundled in packages. Note text is never sent to Habitica. Character layers load from Habitica's official asset host; unavailable layers are omitted.

中文：桌面端设置中勾选「随思源同步连接信息」并「连接并保存」，两端完成思源同步后，手机重新启用插件或点击卡片「刷新」即可读取。默认关闭，不自动迁移原有 Key。开启后连接信息明文保存在工作空间插件文件中；取消并保存会清空共享文件里的凭据，但不会删除其他设备已缓存的副本或历史备份。共享连接信息不代表可同时在多台设备上领取奖励，仍请保留一台主设备。

On mobile, an explicit unchecked task marker now takes precedence over a stale completed-style class, so the native paragraph's inherited grey color and strikethrough disappear immediately. Explicit formatting within the paragraph and custom task markers are preserved. This compatibility stylesheet is removed when the plugin unloads and does not rewrite note content.

Use automatic rewards on **one primary device**. A Web Lock prevents multiple same-origin windows from writing at once, but is not a cross-device lock. On synced changes from elsewhere, rewards pause until the plugin is re-enabled. Completions made while the plugin is disabled are not backfilled. Already-completed newly discovered/imported blocks do not count. Currently only standard SiYuan task-list blocks count, not database checkboxes or code snippets.

The earlier `reader.js` time-spent reader remains isolated for future exploration. **siyuan-time-spent is not required**, and no fatigue or damage system is enabled.

## Development

Version 0.1.3 caps each round's inline progress at its target and labels surplus completions separately; confirmed surplus carries into the next round.

The production build contains no test controls and ignores the old test-mode preference. The separate test build always starts in simulated mode, without credentials: three completions per round, about three seconds to confirm. No Habitica API calls or real reward writes occur. Its card offers simulated TODO completion and coin-effect preview buttons. Simulated progress is stored separately on this device and survives restart. Actual note checkboxes can also test inline feedback, but still edit the notes. Installing the production package restores real progress; completions made in test mode are not backfilled. Both packages use the same plugin ID: replace one with the other, rather than installing them side by side.

中文：正式构建不含测试入口；测试构建默认使用独立模拟进度，每 3 项、约 3 秒结算，不调用 Habitica API。测试按钮不会修改笔记，实际勾选 TODO 则仍会修改笔记。禁用插件后替换为正式包即可恢复真实进度，测试期间的完成不会补发奖励。

```bash
npm run build
npm run build:test
npm test
```

No dependencies are required for building. Production output: `dist/gamify-for-siyuan/` and `dist/package.zip`. Test output: `dist/test/gamify-for-siyuan/` and `dist/package-test.zip`. Building either variant preserves the other. README showcase images use fictional demo data and the real interface; the displayed gold amount is illustrative, not a promised reward.

`shell.cjs` integrates SiYuan; `engine.js` implements persistent progress; `habitica.js` handles API requests and avatar layers; `ui.js` and `index.css` implement the isolated card. See [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) for artwork credits.

To regenerate the three showcase PNGs, install Playwright in your development environment and Chrome, build the production bundle, then run `node scripts/render-showcases.mjs`. The optional `GAMIFY_RENDER_NODE_MODULES` environment variable can point to an existing Node modules directory. The renderer uses fictional data and allows only public character-image requests.
