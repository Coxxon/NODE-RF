/**
 * TemplateDrawer.js
 * Slide-up panel showing saved templates as wireframe cards.
 * Opened by the chevron of the split '+ New Event' button.
 */
import { Store } from '../core/Store.js';

let _drawerEl = null;
let _onSelectCallback = null;
let _isDraggingCard = false;

// ─── Block type display config ────────────────────────────────────────────────

const BLOCK_META = {
  assignment: { label: 'Assignment', color: 'rgba(59,130,246,0.25)',  border: 'rgba(59,130,246,0.5)'  },
  note:       { label: 'Note',       color: 'rgba(234,179,8,0.2)',    border: 'rgba(234,179,8,0.5)'    },
  checklist:  { label: 'Checklist',  color: 'rgba(16,185,129,0.2)',   border: 'rgba(16,185,129,0.5)'   },
  file:       { label: 'Files',      color: 'rgba(168,85,247,0.2)',   border: 'rgba(168,85,247,0.5)'   },
  header:     { label: 'Section',    color: 'rgba(148,163,184,0.15)', border: 'rgba(148,163,184,0.4)'  },
  contact:    { label: 'Contact',    color: 'rgba(249,115,22,0.2)',   border: 'rgba(249,115,22,0.5)'   },
};

// ─── DOM Bootstrap ────────────────────────────────────────────────────────────

function ensureDrawer() {
  if (_drawerEl) return _drawerEl;

  _drawerEl = document.createElement('div');
  _drawerEl.id = 'template-drawer';
  _drawerEl.className = 'template-drawer';
  _drawerEl.innerHTML = `
    <div class="template-drawer__header">
      <div class="template-drawer__title">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16c0 1.1.9 2 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
          <polyline points="10 9 9 9 8 9"/>
        </svg>
        Event Templates
      </div>
      <button class="template-drawer__close" title="Close">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
    <div class="template-drawer__body">
      <div class="template-card-list"></div>
    </div>
  `;

  // Close button
  _drawerEl.querySelector('.template-drawer__close').addEventListener('click', close);

  // Horizontal scroll with mouse wheel
  const listEl = _drawerEl.querySelector('.template-card-list');
  listEl.addEventListener('wheel', (e) => {
    if (e.deltaY !== 0) {
      e.preventDefault(); // Prevent background page from scrolling
      listEl.scrollLeft += e.deltaY;
    }
  });

  // Drag and drop logic for Reordering
  let draggedCard = null;

  listEl.addEventListener('dragstart', (e) => {
    const card = e.target.closest('.template-card');
    if (!card) return;
    _isDraggingCard = true;
    draggedCard = card;
    card.classList.add('dragging');
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  });

  listEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (!draggedCard) return;
    const afterElement = getDragAfterElement(listEl, e.clientX);
    if (afterElement == null) {
      listEl.appendChild(draggedCard);
    } else {
      listEl.insertBefore(draggedCard, afterElement);
    }
  });

  listEl.addEventListener('dragend', async (e) => {
    if (!draggedCard) return;
    draggedCard.classList.remove('dragging');
    draggedCard = null;
    
    // swallow standard click event that often fires directly after drag
    setTimeout(() => { _isDraggingCard = false; }, 50);

    const newCardElements = [...listEl.querySelectorAll('.template-card')];
    
    // Fetch true source of truth from backend
    let sourceTemplates = [];
    if (window.templateAPI) {
      try { sourceTemplates = await window.templateAPI.getTemplates(); } 
      catch (error) { console.error('Failed to fetch templates for reordering', error); }
    } else {
      sourceTemplates = Store.getTemplates(); // fallback if no IPC
    }

    const newOrderedTemplates = [];
    newCardElements.forEach(card => {
      const fullTemplate = sourceTemplates.find(t => t.id === card.dataset.id);
      if (fullTemplate) newOrderedTemplates.push(fullTemplate);
    });

    // SECURITY CHECK: DO NOT SAVE IF DATA IS LOST OR LENGTH MISMATCH
    if (newOrderedTemplates.length !== sourceTemplates.length || newOrderedTemplates.length === 0) {
      console.error('Data loss detected during drag and drop reordering! Aborting save.', { newOrderedTemplates, sourceTemplates });
      _refresh(ensureDrawer()); // Refresh UI to cancel visual DOM changes
      return;
    }

    // Sychronize local memory Store
    const currentStore = Store.getTemplates();
    currentStore.splice(0, currentStore.length, ...newOrderedTemplates);

    // Persist Backend
    if (window.templateAPI && window.templateAPI.reorderTemplates) {
      await window.templateAPI.reorderTemplates(newOrderedTemplates);
    }
    
    // Refresh the quick access buttons on the top layout bar if they exist
    TemplateDrawer.refreshQuickAccess();
  });

  function getDragAfterElement(container, x) {
    const draggableElements = [...container.querySelectorAll('.template-card:not(.dragging)')];
    return draggableElements.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = x - box.left - box.width / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset: offset, element: child };
      } else {
        return closest;
      }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  }

  // Click on backdrop (outside drawer) closes it
  document.addEventListener('mousedown', (e) => {
    if (_drawerEl.classList.contains('open') && !_drawerEl.contains(e.target)) {
      // Allow clicks on the split chevron button itself without double-toggling
      if (!e.target.closest('.btn-split-add__chevron')) close();
    }
  });

  document.body.appendChild(_drawerEl);
  return _drawerEl;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const TemplateDrawer = {
  open(onSelectCallback) {
    _onSelectCallback = onSelectCallback;
    const el = ensureDrawer();
    _refresh(el);
    el.classList.add('open');
  },

  close() {
    close();
  },

  buildTemplatePreview(tpl) {
    const card = document.createElement('div');
    card.className = 'template-card';
    const isFullWidth = (tpl.span === 2);
    card.style.width = isFullWidth ? '290px' : '140px';
    card.style.margin = '0'; // reset drawer padding

    const cardHeader = document.createElement('div');
    cardHeader.className = 'template-card__header';
    const nameEl = document.createElement('div');
    nameEl.className = 'template-card__name';
    const rawName = tpl.name || 'Unnamed';
    nameEl.textContent = rawName.charAt(0).toUpperCase() + rawName.slice(1);
    cardHeader.appendChild(nameEl);

    const wireframe = this.buildWireframe(tpl);
    card.append(cardHeader, wireframe);
    return card;
  },

  buildWireframe(tpl) {
    const wireframe = document.createElement('div');
    wireframe.className = 'template-card__wireframe';
    
    // Card logic mirrors event width: span===2 = full (2 columns), else half
    const isFullWidth = (tpl.span === 2);

    const blocks = tpl.blocks || [];
    if (blocks.length === 0) {
      const emptyWire = document.createElement('div');
      emptyWire.className = 'template-wire-block template-wire-block--empty';
      emptyWire.textContent = 'Empty';
      wireframe.appendChild(emptyWire);
    } else {
      blocks.forEach(b => {
        const meta = BLOCK_META[b.type] || {
          label: b.type, color: 'rgba(148,163,184,0.1)', border: 'rgba(148,163,184,0.3)'
        };
        const wire = document.createElement('div');
        wire.className = 'template-wire-block';
        wire.style.background = meta.color;
        wire.style.borderColor = meta.border;

        if (!isFullWidth) {
          wire.style.width = '100%';
        } else {
          wire.style.width = (b.span === 2 || b.type === 'header') ? '100%' : 'calc(50% - 2px)';
        }

        wire.textContent = meta.label;
        wireframe.appendChild(wire);
      });
    }
    return wireframe;
  },

  async refreshQuickAccess() {
    let templates = [];
    if (window.templateAPI) {
      try { templates = await window.templateAPI.getTemplates(); } catch(e){}
    } else {
      templates = Store.getTemplates();
    }
    
    const btns = document.querySelectorAll('.btn-split-add__quick');
    btns.forEach((btn) => {
      const idx = parseInt(btn.dataset.index, 10);
      const tpl = templates[idx];
      if (tpl) {
        btn.style.display = 'flex';
        btn.title = tpl.name;
        btn.__templateData = tpl;
      } else {
        btn.style.display = 'none';
        btn.title = '';
        btn.__templateData = null;
      }
    });
  }
};

function close() {
  if (_drawerEl) _drawerEl.classList.remove('open');
}

// ─── Render ───────────────────────────────────────────────────────────────────

async function _refresh(drawerEl) {
  const listEl = drawerEl.querySelector('.template-card-list');
  listEl.innerHTML = '<div class="template-drawer__loading">Loading…</div>';

  let templates = [];
  if (window.templateAPI) {
    try { templates = await window.templateAPI.getTemplates(); }
    catch (e) { console.error('Failed to load templates:', e); }
  }

  listEl.innerHTML = '';

  if (templates.length === 0) {
    listEl.innerHTML = `
      <div class="template-drawer__empty">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16c0 1.1.9 2 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
        <p>No templates saved yet.<br>Use the <strong>⋮ menu</strong> on an Event to save one.</p>
      </div>`;
    return;
  }

  templates.forEach(tpl => {
    listEl.appendChild(_buildCard(tpl));
  });
}

function _buildCard(tpl) {
  const card = document.createElement('div');
  card.className = 'template-card';
  card.draggable = true;
  card.dataset.id = tpl.id;

  // Card width mirrors event width: span===2 = full (2 columns), else half
  const isFullWidth = (tpl.span === 2);
  card.style.width = isFullWidth ? '290px' : '140px';

  // ── Header ──
  const cardHeader = document.createElement('div');
  cardHeader.className = 'template-card__header';

  const nameEl = document.createElement('div');
  nameEl.className = 'template-card__name';
  const rawName = tpl.name || 'Unnamed';
  nameEl.textContent = rawName.charAt(0).toUpperCase() + rawName.slice(1);

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'template-card__delete';
  deleteBtn.title = 'Delete template';
  deleteBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
    <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
  </svg>`;
  deleteBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    deleteBtn.disabled = true;
    
    // 1. Delete from persistent storage
    if (window.templateAPI) await window.templateAPI.deleteTemplate(tpl.id);
    
    // 2. Delete from local session Store (prevents ghost data blocking future saves)
    const localTemplates = Store.getTemplates();
    const idx = localTemplates.findIndex(t => t.id === tpl.id);
    if (idx !== -1) localTemplates.splice(idx, 1);

    // 3. Refresh UI
    _refresh(ensureDrawer());
    TemplateDrawer.refreshQuickAccess();
  });

  cardHeader.append(nameEl, deleteBtn);

  // ── Wireframe blocks ──
  const wireframe = TemplateDrawer.buildWireframe(tpl);

  card.append(cardHeader, wireframe);

  // ── Click to inject — pass FULL template object, not just ID ──
  card.addEventListener('click', () => {
    if (_isDraggingCard) return;
    if (_onSelectCallback) _onSelectCallback(tpl);
    close();
  });

  return card;
}
