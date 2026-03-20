import { EVENT_PALETTE } from '../core/Constants.js';

export function openCreateEventMenu(e, anchor, templates, onCreateEvent) {
  if (templates.length === 0) {
    onCreateEvent();
    return;
  }

  closeAllPopups();
  const m = document.createElement('div');
  m.className = 'block-add-menu'; 
  m.id = '__ctx-menu';

  const blank = document.createElement('button');
  blank.className = 'ctx-item';
  blank.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:8px"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg> Blank Event`;
  blank.addEventListener('click', () => { onCreateEvent(); closeAllPopups(); });
  m.appendChild(blank);

  const divider = document.createElement('div');
  divider.className = 'dropdown-divider';
  m.appendChild(divider);

  const label = document.createElement('div');
  label.style.cssText = 'padding: 4px 14px; font-size: 0.65rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;';
  label.textContent = 'Templates';
  m.appendChild(label);

  templates.forEach(t => {
    const b = document.createElement('button');
    b.className = 'ctx-item';
    b.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:8px"><path d="M20 7h-9l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"></path></svg> ${t.name}`;
    b.addEventListener('click', () => { onCreateEvent(t.id); closeAllPopups(); });
    m.appendChild(b);
  });

  positionPopup(m, anchor);
  setTimeout(() => document.addEventListener('click', () => closeAllPopups(), { once: true }), 10);
}

export function openEventContextMenu(e, evt, callbacks) {
  closeAllPopups();
  const m = document.createElement('div'); m.className = 'event-context-menu'; m.id = '__ctx-menu';
  const items = [
    { label: 'Duplicate', action: () => callbacks.onDuplicate(evt) },
    { label: 'Save as template', action: () => callbacks.onSaveAsTemplate(evt) },
    { label: 'Delete event', danger: true, action: () => callbacks.onDelete(evt.id) }
  ];
  items.forEach(item => {
    const b = document.createElement('button'); 
    b.className = 'ctx-item' + (item.danger ? ' danger' : '');
    b.textContent = item.label;
    
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      
      if (item.danger) {
        if (b.dataset.confirmed !== 'true') {
          b.dataset.confirmed = 'true';
          b.dataset.armed = 'false';
          b.textContent = 'Confirm?';
          b.classList.add('confirm-danger');
          
          setTimeout(() => { b.dataset.armed = 'true'; }, 400);
          
          m.querySelectorAll('.ctx-item').forEach(other => {
            if (other !== b) {
              other.style.opacity = '0.3';
              other.style.pointerEvents = 'none';
            }
          });

          const reset = (clickAny) => {
            if (clickAny.target !== b) {
              b.dataset.confirmed = 'false';
              b.dataset.armed = 'false';
              b.textContent = item.label;
              b.classList.remove('confirm-danger');
              m.querySelectorAll('.ctx-item').forEach(other => {
                other.style.opacity = '1';
                other.style.pointerEvents = 'auto';
              });
              document.removeEventListener('click', reset);
            }
          };
          setTimeout(() => document.addEventListener('click', reset), 10);
          return;
        }
        if (b.dataset.armed !== 'true') return;
      }

      closeAllPopups();
      item.action();
    });
    m.appendChild(b);
  });
  positionPopup(m, { getBoundingClientRect: () => ({ left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY, width:0, height:0 }) });
  
  setTimeout(() => {
    document.addEventListener('click', () => closeAllPopups(), { once: true });
  }, 10);
}

export function openBlockAddMenu(e, evt, anchor, callbacks) {
  closeAllPopups();
  const m = document.createElement('div'); m.className = 'block-add-menu'; m.id = '__block-add-menu';
  const types = [
    { id: 'header', label: 'Section Title' },
    { id: 'assignment', label: 'Assignment' },
    { id: 'contact', label: 'Contacts' },
    { id: 'note', label: 'Note' },
    { id: 'checklist', label: 'Checklist' },
    { id: 'file', label: 'File Block' }
  ];
  types.forEach(t => {
    const b = document.createElement('button'); 
    b.className = 'ctx-item'; 
    b.textContent = t.label;
    b.addEventListener('click', () => { 
      const newBlock = { id: callbacks.generateUID(), type: t.id };
      if (t.id === 'checklist') {
        newBlock.items = [
          { id: callbacks.generateUID(), label: '', checked: false },
          { id: callbacks.generateUID(), label: '', checked: false },
          { id: callbacks.generateUID(), label: '', checked: false }
        ];
      }
      if (t.id === 'file') {
        newBlock.items = [];
      }
      evt.blocks.push(newBlock); 
      callbacks.onSave(evt); 
      callbacks.onRender(); 
      closeAllPopups(); 
    });
    m.appendChild(b);
  });
  positionPopup(m, anchor);
  setTimeout(() => document.addEventListener('click', () => closeAllPopups(), { once: true }), 10);
}

export function openColorPicker(e, evt, dot, onSave) {
  closeAllPopups();
  const p = document.createElement('div'); p.className = 'color-picker-popup'; p.id = '__ctx-menu';
  const g = document.createElement('div'); g.className = 'color-grid';
  EVENT_PALETTE.forEach(c => {
    const o = document.createElement('div'); o.className = 'color-opt' + (evt.color === c ? ' active' : ''); o.style.background = c;
    o.addEventListener('click', () => { 
      evt.color = c; 
      dot.style.background = c; 
      // Mission 2: Live Update the header
      const header = dot.closest('.event-header');
      if (header) {
        header.style.background = c + '1A';
        header.style.borderBottom = `1.5px solid ${c}`;
      }
      onSave(evt); 
      closeAllPopups(); 
    });
    g.appendChild(o);
  });
  p.appendChild(g); positionPopup(p, dot);
  setTimeout(() => document.addEventListener('click', () => closeAllPopups(), { once: true }), 10);
}

export function openNoteColorPicker(e, anchor, onSave) {
  e.stopPropagation(); 
  closeAllPopups();
  const p = document.createElement('div'); 
  p.className = 'color-picker-popup note-cp'; 
  p.id = '__ctx-menu';
  
  const g = document.createElement('div'); 
  g.className = 'color-grid';
  
  const notePalette = ['var(--text-main)', ...EVENT_PALETTE].slice(0, 9);
  
  notePalette.forEach(c => {
    const o = document.createElement('div'); 
    o.className = 'color-opt'; 
    o.style.background = c;
    if (c === 'var(--text-main)') {
      o.style.border = '1px dashed rgba(255,255,255,0.2)';
      o.title = 'Theme default';
    }
    
    o.addEventListener('click', (ev) => {
      ev.stopPropagation();
      
      let finalColor = c;
      if (c.startsWith('var(')) {
        finalColor = getComputedStyle(document.documentElement).getPropertyValue('--text-main').trim();
      }

      if (anchor._lastRange) {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(anchor._lastRange);
      }
      
      document.execCommand('styleWithCSS', false, true);
      document.execCommand('foreColor', false, finalColor);
      
      onSave();
      closeAllPopups();
    });
    g.appendChild(o);
  });
  
  p.appendChild(g); 
  positionPopup(p, anchor);
  
  setTimeout(() => {
    document.addEventListener('click', () => closeAllPopups(), { once: true });
  }, 50);
}

export function openZoneSelector(e, target, anchor, context) {
  closeAllPopups();
  const menu = document.createElement('div'); menu.className = 'event-context-menu'; menu.id = '__ctx-menu';
  const zones = context.zones;
  if (!zones.length) { menu.innerHTML = '<div class="ctx-item">No zones found</div>'; }
  else {
    zones.forEach(z => {
      const b = document.createElement('button'); b.className = 'ctx-item' + (target.rfZone === z ? ' active' : ''); b.textContent = z;
      b.addEventListener('click', () => {
        if (target.rfZone && target.rfZone !== z) {
           if (confirm(`Change zone to "${z}"? This will affect all events on this page.`)) { 
             target.rfZone = z; 
             context.onSave(); 
             if (context.isPage) context.updateUI();
             context.onRender(); 
           }
        } else { 
          target.rfZone = z; 
          context.onSave(); 
          if (context.isPage) context.updateUI();
          context.onRender(); 
        }
        closeAllPopups();
      });
      menu.appendChild(b);
    });
  }
  positionPopup(menu, anchor);
  setTimeout(() => document.addEventListener('click', () => closeAllPopups(), { once: true }), 10);
}

export function openRFPicker(e, row, evt, badge, context) {
  closeAllPopups();
  if (!context.zone) { 
    showToast('Please select an RF Zone for this page first (top toolbar).'); 
    return; 
  }
  const p = document.createElement('div'); p.className = 'rf-picker'; p.id = '__rf-picker';
  const s = document.createElement('input'); s.className = 'rf-picker-search'; s.placeholder = 'Search…';
  const l = document.createElement('div'); l.className = 'rf-picker-list';
  const renderList = (q = '') => {
    l.innerHTML = '';
    const qn = q.toLowerCase();
    context.channels.filter(c => c.freq.includes(qn) || c.name.toLowerCase().includes(qn)).forEach(ch => {
      const i = document.createElement('div'); i.className = 'rf-picker-item';
      i.innerHTML = `<span class="rf-picker-freq">${ch.freq}</span><span class="rf-picker-name">${ch.name}</span>`;
      i.addEventListener('click', () => { 
        context.onSelect(ch, row, evt, badge);
        closeAllPopups(); 
      });
      l.appendChild(i);
    });
  };
  p.append(s, l); renderList();
  s.addEventListener('input', () => renderList(s.value));
  positionPopup(p, badge);
  setTimeout(() => s.focus(), 50);
  document.addEventListener('click', () => closeAllPopups(), { once: true });
}

export function showCustomPrompt(title, msg, defaultValue, onOk) {
  closeAllPopups();
  const overlay = document.createElement('div');
  overlay.id = '__custom-prompt'; 
  overlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.4); backdrop-filter:blur(4px); display:flex; align-items:center; justify-content:center; z-index:3000;';
  
  const box = document.createElement('div');
  box.className = 'event-context-menu'; 
  box.style.cssText = 'width:320px; padding:20px; box-sizing:border-box; gap:16px; display:flex; flex-direction:column;';
  
  const t = document.createElement('div');
  t.style.cssText = 'font-size:0.9rem; font-weight:800; color:white; text-align:center;';
  t.textContent = title;
  
  const m = document.createElement('div');
  m.style.cssText = 'font-size:0.75rem; color:var(--text-muted); text-align:center; margin-bottom:4px; line-height:1.4;';
  m.textContent = msg;
  
  const input = document.createElement('input');
  input.className = 'block-field';
  input.style.cssText = 'background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); padding:10px; font-size:0.9rem; margin:8px 0 0 0; width:100%; box-sizing:border-box;';
  input.value = defaultValue;
  input.placeholder = 'Template name...';

  // Error box allowing dynamic height wrapping without absolute positioning
  const errBox = document.createElement('div');
  errBox.id = 'tpl-error';
  errBox.style.cssText = 'color: #ef4444; font-size: 0.75rem; min-height: 0; height: auto; display: none; margin: 4px 0 8px 0; text-align: center; width: 100%; line-height: 1.3; font-weight: 500;';
  errBox.textContent = 'Error placeholder';
  
  const btns = document.createElement('div');
  btns.style.cssText = 'display:flex; gap:10px; width:100%; margin-top: auto;';
  
  const cancel = document.createElement('button');
  cancel.className = 'ctx-item';
  cancel.style.flex = '1';
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', () => overlay.remove());
  
  const ok = document.createElement('button');
  ok.className = 'ctx-item active';
  ok.style.flex = '1';
  ok.textContent = 'Save';
  
  const doOk = async () => {
    const val = input.value.trim();
    if (val) {
      if (typeof onOk === 'function') {
        const result = await onOk(val);
        if (typeof result === 'string') {
          errBox.textContent = result;
          errBox.style.display = 'block';
          return;
        }
      }
    }
    overlay.remove();
  };
  
  ok.addEventListener('click', doOk);
  input.addEventListener('keydown', (e) => { 
    if(e.key === 'Enter') doOk(); 
    if(e.key === 'Escape') overlay.remove(); 
    if(errBox.style.display === 'block') errBox.style.display = 'none'; // hide error on typing
  });
  
  btns.append(cancel, ok);
  box.append(t, m, input, errBox, btns);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  
  setTimeout(() => input.select(), 50);
}

export function showToast(msg) {
  const toast = document.createElement('div');
  toast.style.cssText = 'position:fixed; bottom:24px; left:50%; transform:translateX(-50%); background:var(--primary); color:white; padding:12px 24px; border-radius:30px; font-weight:600; box-shadow:0 10px 30px rgba(0,0,0,0.3); z-index:10000; animation: slideUp 0.3s ease-out;';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'fadeOut 0.3s ease-in forwards';
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

export function positionPopup(el, anchor) {
  document.body.appendChild(el);
  const r = anchor.getBoundingClientRect();
  const w = el.offsetWidth || 300, h = el.offsetHeight || 300;
  let l = r.left; if (l + w > window.innerWidth) l = window.innerWidth - w - 10;
  let t = r.bottom + 5; if (t + h > window.innerHeight) t = r.top - h - 5;
  el.style.position = 'fixed'; el.style.left = `${Math.max(10, l)}px`; el.style.top = `${Math.max(10, t)}px`;
}

export function closeAllPopups() {
  ['__rf-picker','__block-add-menu','__ctx-menu','__conflict-tooltip'].forEach(id => document.getElementById(id)?.remove());
}
