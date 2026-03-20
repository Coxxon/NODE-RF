/**
 * ContactBlock.js — Content Variant
 */
import { handleVerticalNavigation } from '../../../utils.js';

export function buildContactBlockBody(block, evt, callbacks = {}) {
  const generateUID = () => Math.random().toString(36).slice(2, 10);
  if (!block.rows) block.rows = [{ id: generateUID(), role: '', name: '', info: '' }];
  const cnt = document.createElement('div');
  cnt.className = 'block-body';
  
  block.rows.forEach(row => {
    const rowEl = document.createElement('div');
    rowEl.className = 'block-row contact-row';
    
    // Name field
    const nIn = document.createElement('input');
    nIn.className = 'block-field contact-name';
    nIn.value = row.name || '';
    nIn.placeholder = 'Name';
    nIn.addEventListener('input', () => { 
      row.name = nIn.value; 
      if (callbacks.onSave) callbacks.onSave(evt); 
    });
    nIn.addEventListener('keydown', (e) => { 
      if (e.key === 'Enter') nIn.blur(); 
      handleVerticalNavigation(e, '.block-field.contact-name');
    });

    // Role field
    const rIn = document.createElement('input');
    rIn.className = 'block-field contact-role';
    rIn.value = row.role || '';
    rIn.placeholder = 'Role';
    rIn.addEventListener('input', () => { 
      row.role = rIn.value; 
      if (callbacks.onSave) callbacks.onSave(evt); 
    });
    rIn.addEventListener('keydown', (e) => { 
      if (e.key === 'Enter') rIn.blur(); 
      handleVerticalNavigation(e, '.block-field.contact-role');
    });
    
    // Info field
    const iIn = document.createElement('input');
    iIn.className = 'block-field contact-info';
    iIn.value = row.info || '';
    iIn.placeholder = 'Contact';
    iIn.addEventListener('input', () => { 
      row.info = iIn.value; 
      if (callbacks.onSave) callbacks.onSave(evt); 
    });
    iIn.addEventListener('keydown', (e) => { 
      if (e.key === 'Enter') iIn.blur(); 
      handleVerticalNavigation(e, '.block-field.contact-info');
    });
    
    const del = document.createElement('button');
    del.className = 'assignment-row-del btn-row-del';
    del.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
    del.addEventListener('click', () => {
      block.rows = block.rows.filter(r => r.id !== row.id);
      if (callbacks.onSave) callbacks.onSave(evt);
      if (callbacks.onRender) callbacks.onRender();
    });
    
    rowEl.append(nIn, rIn, iIn, del);
    cnt.appendChild(rowEl);
  });
  return cnt;
}
