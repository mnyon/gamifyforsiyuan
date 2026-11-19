import { characterCount, parseBlockUpdated } from './activity.js';

export class EditTracker {
  constructor({ lookup, onEdit, onError = () => {} }) {
    this.lookup = lookup; this.onEdit = onEdit; this.onError = onError;
    this.updated = new Map(); this.generations = new Map(); this.listeners = [];
  }
  start() {
    const listen = (name, fn) => { this.listeners.push([name, fn]); document.addEventListener(name, fn, true); };
    listen('compositionstart', event => {
      if (!event.isTrusted) return;
      const editor = this.editor(event); if (!editor) return;
      this.pending = null; this.composition = { editor, before: this.snapshot(editor), at: Date.now() };
    });
    listen('compositionend', event => {
      // A trusted start and trusted input establish the operation. Some Chromium
      // IME bridges deliver an untrusted end notification for that same operation.
      if (!this.composition) return;
      const operation = this.composition; this.composition = null;
      if (!operation.receivedInput) return;
      this.commit(operation);
      this.pending = { ...operation, before: this.snapshot(operation.editor), accepted: true, at: Date.now() };
    });
    listen('beforeinput', event => {
      if (!event.isTrusted || this.composition) return;
      const editor = this.editor(event); this.pending = null;
      if (!editor) return;
      const accepted = ['insertText', 'insertReplacementText', 'insertFromComposition', 'insertCompositionText',
        'deleteContentBackward', 'deleteContentForward', 'deleteWordBackward', 'deleteWordForward',
        'deleteSoftLineBackward', 'deleteSoftLineForward', 'deleteEntireSoftLine',
        'deleteHardLineBackward', 'deleteHardLineForward', 'deleteContent'].includes(event.inputType);
      this.pending = { editor, before: this.snapshot(editor), accepted, type: event.inputType, at: Date.now() };
    });
    listen('input', event => {
      if (!event.isTrusted) return;
      if (this.composition) { this.composition.receivedInput = true; return; }
      const operation = this.pending; this.pending = null;
      if (!operation || operation.editor !== this.editor(event) || Date.now() - operation.at > 10000) return;
      this.commit(operation, operation.accepted && (!operation.type || operation.type === event.inputType));
    });
    listen('focusin', () => this.prefetch());
    listen('pointerdown', () => this.prefetch());
    this.prefetch();
  }
  editor(event) {
    const editor = event.target?.closest?.('.protyle-wysiwyg');
    const selection = document.getSelection();
    const anchor = selection?.anchorNode?.nodeType === 1 ? selection.anchorNode : selection?.anchorNode?.parentElement;
    if (!editor || !anchor || !editor.contains(anchor) || anchor.closest('[contenteditable="false"]')) return null;
    return editor;
  }
  snapshot(editor) {
    const parts = [], spans = [], metadata = new Map(); let length = 0;
    // Empty old paragraphs have no text nodes, but still have an editing history.
    for (const block of editor.querySelectorAll('[data-node-id]')) {
      const id = block.dataset.nodeId;
      metadata.set(id, this.updated.has(id) ? this.updated.get(id) : parseBlockUpdated(block.getAttribute('updated') || block.dataset.updated));
    }
    const walker = document.createTreeWalker(editor, 4);
    while (walker.nextNode()) {
      const node = walker.currentNode, parent = node.parentElement;
      if (parent.closest('.protyle-attr, .protyle-action, [contenteditable="false"], .protyle-action--task')) continue;
      const block = parent.closest('[data-node-id]'), id = block?.dataset.nodeId;
      if (!/^\d{14}-[a-z0-9]{7}$/.test(id || '')) continue;
      const text = node.nodeValue || '', size = Array.from(text).length;
      spans.push({ id, start: length, end: length + size });
      parts.push(text); length += size;
    }
    return { text: Array.from(parts.join('')), spans, metadata };
  }
  commit(operation, accepted = true) {
    if (this.stopped) return;
    const before = operation.before, after = this.snapshot(operation.editor), a = before.text, b = after.text;
    let left = 0, right = 0;
    while (left < a.length && left < b.length && a[left] === b[left]) left++;
    while (right < a.length - left && right < b.length - left && a[a.length - right - 1] === b[b.length - right - 1]) right++;
    const edits = new Map();
    const collect = (snapshot, end, field) => {
      for (const span of snapshot.spans) {
        const start = Math.max(left, span.start), stop = Math.min(end, span.end);
        if (stop <= start) continue;
        const edit = edits.get(span.id) || { id: span.id, inserted: 0, deleted: 0,
          previousUpdated: before.metadata.get(span.id) ?? null };
        edit[field] += characterCount(snapshot.text.slice(start, stop).join('')); edits.set(span.id, edit);
      }
    };
    collect(before, a.length - right, 'deleted'); collect(after, b.length - right, 'inserted');
    for (const [id] of edits) {
      this.generations.set(id, (this.generations.get(id) || 0) + 1); this.updated.set(id, Date.now());
    }
    if (accepted && edits.size) {
      try { this.onEdit([...edits.values()], operation.at); } catch (error) { this.onError(error); }
    }
  }
  async prefetch() {
    if (this.stopped || this.loading) return;
    const ids = [...new Set([...document.querySelectorAll('.protyle-wysiwyg [data-node-id]')]
      .map(node => node.dataset.nodeId).filter(id => /^\d{14}-[a-z0-9]{7}$/.test(id) && !this.updated.has(id)))];
    if (!ids.length) return;
    this.loading = true;
    const generations = new Map(ids.map(id => [id, this.generations.get(id) || 0]));
    try {
      for (let offset = 0; offset < ids.length; offset += 200) {
        const rows = await this.lookup(ids.slice(offset, offset + 200));
        if (this.stopped) return;
        for (const row of rows) if ((this.generations.get(row.id) || 0) === generations.get(row.id)) this.updated.set(row.id, parseBlockUpdated(row.updated));
      }
    } catch (error) { this.onError(error); }
    finally { this.loading = false; }
  }
  stop() {
    this.stopped = true;
    for (const [name, fn] of this.listeners) document.removeEventListener(name, fn, true);
    this.pending = null; this.composition = null;
  }
}
