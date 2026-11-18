export function calendarDay(now = Date.now()) {
  const date = new Date(now);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function newProgress() {
  return { version: 1, target: null, pending: {}, credits: [], used: {}, rewards: [], total: 0 };
}

export function targetFor(count) { return Math.max(1, Math.ceil(count / 100)); }

// SiYuan task-list items contain a checkbox on their first markdown line.
export function taskDone(markdown) {
  const match = String(markdown).match(/^\s*(?:[-+*]|\d+[.)])\s+\[([ xX])\]/);
  return match ? match[1].toLowerCase() === 'x' : null;
}

export class TodoProgress {
  constructor(state = newProgress(), uid = () => crypto.randomUUID()) {
    if (state.version !== 1) throw new Error('进度版本不兼容，请先升级插件');
    this.state = state;
    this.uid = uid;
    this.previous = null;
  }

  localChange(id, done, now = Date.now()) {
    const state = this.state, day = calendarDay(now);
    state.used[day] ||= {};
    if (!done) {
      delete state.pending[id];
      state.credits = state.credits.filter(credit => credit.id !== id);
      return false;
    }
    if (state.pending[id] || state.credits.some(credit => credit.id === id) || state.used[day][id] === 'spent' || state.used[day][id] === true) return false;
    state.pending[id] = { since: now, day };
    return true;
  }

  observe(rows, now = Date.now()) {
    const current = new Map(rows.map(row => [row.id, taskDone(row.markdown)]).filter(([, done]) => done !== null));
    const day = calendarDay(now);
    const backlog = [...current.values()].filter(done => !done).length;
    const state = this.state;
    if (state.snapshot?.day !== day) state.snapshot = { day, backlog, target: targetFor(backlog) };
    if (state.target === null) state.target = state.snapshot.target;
    // Keep ids used today, plus dates still referenced by an unfinished round.
    const keep = new Set([day, ...state.credits.map(c => c.day), ...Object.values(state.pending).map(c => c.day)]);
    for (const key of Object.keys(state.used)) if (!keep.has(key)) delete state.used[key];
    state.used[day] ||= {};
    const completed = [];
    for (const [id, item] of Object.entries(state.pending)) {
      if (current.get(id) !== true) { delete state.pending[id]; continue; }
      if (now - item.since >= 60000) {
        state.used[item.day] ||= {};
        if (state.used[item.day][id] !== 'spent' && state.used[item.day][id] !== true) {
          state.credits.push({ id, day: item.day });
          state.used[item.day][id] = 'unspent';
        }
        delete state.pending[id];
      }
    }
    // An unchecked/deleted item withdraws only an unspent contribution.
    state.credits = state.credits.filter(c => {
      if (current.get(c.id) === true) return true;
      return false;
    });
    if (this.previous) {
      for (const [id, done] of current) {
        if (done && this.previous.get(id) === false && !state.pending[id]) {
          if (!state.used[day][id] || state.used[day][id] === 'unspent') {
            state.pending[id] = { since: now, day };
            completed.push(id);
          }
        }
      }
    }
    this.previous = current;
    while (state.credits.length >= state.target) {
      const credits = state.credits.splice(0, state.target);
      for (const credit of credits) state.used[credit.day][credit.id] = 'spent';
      state.rewards.push({ id: this.uid(), status: 'queued', created: now, count: credits.length, sources: credits.map(credit => credit.id) });
      state.target = state.snapshot.target;
    }
    return { completed, backlog, pending: Object.keys(state.pending).length };
  }
}
