# Gamify for SiYuan

Complete TODOs in SiYuan. Watch your Habitica character grow, one small step at a time.

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

Version 0.1.1 fixes a collision with SiYuan's `kernel` instance property and uses explicit, timeout-bounded file API calls for progress reads/writes. Failed reads do not reset existing progress; failed saves retain the underlying explanation. Disable version 0.1.0, replace the plugin folder, then re-enable. Existing `storage/petal/gamify-for-siyuan/progress.json` is preserved.

Build, then copy `dist/gamify-for-siyuan` into your workspace's `data/plugins/` directory. Restart/reload SiYuan and enable the plugin. Open the bottom-right star and enter Habitica User ID and API Token. Connecting creates the dedicated Habit; connection itself does not score it. Mobile uses a top-bar entry.

Credentials are stored in this device's browser storage, not the synced plugin data, source, or package. They are not encrypted; clear them by clearing this plugin's local browser storage. Only Habitica receives credentials. Note text is never sent to Habitica. Character layers load from Habitica's official asset host; unavailable layers are omitted.

Use automatic rewards on **one primary device**. A Web Lock prevents multiple same-origin windows from writing at once, but is not a cross-device lock. On synced changes from elsewhere, rewards pause until the plugin is re-enabled. Completions made while the plugin is disabled are not backfilled. Already-completed newly discovered/imported blocks do not count. Currently only standard SiYuan task-list blocks count, not database checkboxes or code snippets.

The earlier `reader.js` time-spent reader remains isolated for future exploration. **siyuan-time-spent is not required**, and no fatigue or damage system is enabled.

## Development

Version 0.1.3 caps each round's inline progress at its target and labels surplus completions separately; confirmed surplus carries into the next round.

Enable **测试模式 (Test mode)** in the card settings without credentials. Test progress is stored separately on this device and survives restart: three completions per round, about three seconds to confirm. No Habitica API calls or real reward writes occur. The card offers simulated TODO completion and coin-effect preview buttons. Actual note checkboxes can also test inline feedback, but still edit the notes. Turning test mode off restores real progress and normal settlement; completions made in test mode are not backfilled.

```bash
npm run build
npm test
```

No dependencies are required. The build emits a CommonJS SiYuan entry and `dist/package.zip`. `shell.cjs` integrates SiYuan; `engine.js` implements persistent progress; `habitica.js` handles API requests and avatar layers; `ui.js` and `index.css` implement the isolated card. See [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) for artwork credits.
