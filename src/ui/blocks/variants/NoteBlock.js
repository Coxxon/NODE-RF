/**
 * NoteBlock.js — Content Variant
 */
import { sharedState } from '../../../core/StateProvider.js';

export function buildNoteBody(block, evt, callbacks = {}) {
  const editor = document.createElement('div');
  editor.className = 'block-note-editable';
  editor.contentEditable = 'true';
  editor.innerHTML = block.content || '';

  editor.addEventListener('input', () => {
    block.content = editor.innerHTML;
    if (callbacks.onSave) callbacks.onSave(evt);
  });

  return editor;
}

export function buildNoteToolbar(block, evt, callbacks = {}) {
  const tb = document.createElement('div');
  tb.className = 'note-toolbar';
  
  const tools = [
    { label: 'B', cmd: 'bold', shortcut: 'b' },
    { label: 'I', cmd: 'italic', shortcut: 'i' },
    { label: 'U', cmd: 'underline', shortcut: 'u' }
  ];
  
  tools.forEach(tool => {
    const btn = document.createElement('button');
    btn.className = 'note-tool-btn';
    btn.textContent = tool.label;
    btn.title = `Format ${tool.cmd} (Ctrl+${tool.shortcut.toUpperCase()})`;
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (sharedState.recordSnapshot) sharedState.recordSnapshot();
      document.execCommand(tool.cmd, false, null);
    });
    tb.appendChild(btn);
  });

  const cp = document.createElement('button');
  cp.className = 'note-tool-btn';
  cp.innerHTML = `<div class="toolbar-color-dot" style="width:10px;height:10px;border-radius:50%;background:currentColor;"></div>`;
  cp.title = 'Text color';
  cp.addEventListener('click', (e) => {
    e.stopPropagation();
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      cp._lastRange = selection.getRangeAt(0);
    }
    if (callbacks.onOpenColorPicker) callbacks.onOpenColorPicker(e, cp);
  });
  tb.appendChild(cp);

  return tb;
}
