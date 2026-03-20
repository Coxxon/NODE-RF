/**
 * AssignmentBlock.js — Content Variant
 */

export function buildAssignmentBody(block, evt, callbacks = {}) {
  const generateUID = () => Math.random().toString(36).slice(2, 10);
  if (!block.rows) block.rows = [{ id: generateUID(), personName: '', deviceLabel: '', rfChannelId: null }];
  const cnt = document.createElement('div');
  cnt.className = 'block-body';
  
  block.rows.forEach(row => {
    if (callbacks.buildRow) {
      cnt.appendChild(callbacks.buildRow(row, block, evt));
    }
  });
  
  return cnt;
}
