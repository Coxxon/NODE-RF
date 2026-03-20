/**
 * ChecklistBlock.js — Content Variant
 */

export function buildChecklistBody(block, evt, callbacks = {}) {
  if (!block.items) block.items = [];
  const w = document.createElement('div');
  w.className = 'block-checklist';
  
  const render = () => {
    w.innerHTML = '';
    block.items.forEach((item, i) => {
      const r = document.createElement('div'); 
      r.className = 'checklist-item';
      
      const cb = document.createElement('input'); 
      cb.type = 'checkbox'; 
      cb.checked = item.checked;
      cb.addEventListener('change', () => { 
        item.checked = cb.checked; 
        if (callbacks.onSave) callbacks.onSave(evt); 
        render(); 
      });
      
      const li = document.createElement('input'); 
      li.className = 'checklist-item-label' + (item.checked ? ' done' : '');
      li.value = item.label; 
      li.placeholder = 'Item…';
      li.addEventListener('input', () => { 
        item.label = li.value; 
        if (callbacks.onSave) callbacks.onSave(evt); 
      });
      
      const d = document.createElement('button'); 
      d.className = 'checklist-item-del';
      d.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
      d.addEventListener('click', () => { 
        block.items.splice(i, 1); 
        if (callbacks.onSave) callbacks.onSave(evt); 
        render(); 
      });
      
      r.append(cb, li, d); 
      w.appendChild(r);
    });
  };
  
  render();
  return w;
}
