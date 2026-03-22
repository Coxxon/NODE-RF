/**
 * assignments.js — Assignment Tracker module for NODE RF
 * Orchestrates high-level state, view switching, and delegating to UI Managers.
 */
import * as PopupManager from './ui/PopupManager.js';
import { EVENT_PALETTE } from './core/Constants.js';
import { generateUID } from './utils.js';
import { sharedState } from './core/StateProvider.js';
import { Store } from './core/Store.js';
import { EventHub } from './core/EventHub.js';
import { EventInteractions } from './ui/interactions/EventInteractions.js';
import { BlockInteractions } from './ui/interactions/BlockInteractions.js';
import { LayoutEngine } from './ui/LayoutEngine.js';
import { TabManager } from './ui/TabManager.js';
import { TemplateDrawer } from './ui/TemplateDrawer.js';

// ─── Persistence ──────────────────────────────────────────────────────────────

export function getAssignmentState() {
  return Store.getStateSnapshot();
}

export function setAssignmentState(data) {
  if (!data) return;
  Store.setPages(data.assignPages || []);
  Store.setEvents(data.assignEvents || {});
  if (data.assignTemplates && data.assignTemplates.length > 0) {
    Store.setTemplates(data.assignTemplates);
  }
  Store.setLastView(data.lastView || null);
  
  Store.migrate();
  renderPageTabs();
  renderPageCanvas();
  
  const pages = Store.getPages();
  const cid = Store.getCurrentPageId();
  if (pages.length) {
    if (!cid || !pages.find(p => p.id === cid)) {
        Store.setCurrentPageId(pages[0].id);
    }
  } else {
    Store.setCurrentPageId(null);
  }
}

export function getAssignmentsLastView() {
  return Store.getLastView();
}

export function clearAssignments() {
  Store.setPages([]);
  Store.setEvents({});
  Store.setTemplates([]);
  Store.setCurrentPageId(null);
  Store.setLastView(null);
  localStorage.removeItem('node_rf_assignments');
  renderPageTabs();
  renderPageCanvas();
}

export function saveAssignments() {
  Store.save();
}

export function loadAssignments() {
  Store.load();
}

// ─── View Management ──────────────────────────────────────────────────────────

export function switchView(view /* 'inventory' | pageId */) {
  const isInventory = view === 'inventory';
  const tabInventory = document.getElementById('tabInventory');
  const inventoryView = document.getElementById('inventoryView');
  const assignmentView = document.getElementById('assignmentView');
  
  // Update active state on static Inventory tab
  if (tabInventory) tabInventory.classList.toggle('active', isInventory);
  // Update active state on dynamic page tabs
  document.querySelectorAll('.page-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.pageId === view);
  });

  if (inventoryView) inventoryView.classList.toggle('active', isInventory);
  if (assignmentView) assignmentView.classList.toggle('active', !isInventory);
  
  // Toolbar management
  const searchBox = document.getElementById('searchBoxContainer');
  const btnZone = document.getElementById('btnPageZone');
  const btnEdit = document.getElementById('btnToggleEdit');
  
  if (searchBox) searchBox.style.display = isInventory ? 'flex' : 'none';
  if (btnZone) btnZone.style.display = isInventory ? 'none' : 'flex';
  if (btnEdit) btnEdit.style.display = isInventory ? 'flex' : 'none';

  // Global Lock Visibility & State
  const btnLock = document.getElementById('btnGlobalLock');
  if (btnLock) {
    btnLock.style.display = isInventory ? 'none' : 'flex';
    // Apply the specific lock state for this view
    if (window.applyPageLockState) window.applyPageLockState(view);
  }

  if (!isInventory) {
    Store.setCurrentPageId(view);
    if (sharedState.isEditMode) {
      sharedState.isEditMode = false;
      if (sharedState.applyEditMode) sharedState.applyEditMode();
    }
    updateToolbarZoneUI();
    renderPageCanvas();
  } else {
    Store.setCurrentPageId(null);
  }
  if (window.updateGlobalExpandIcon) window.updateGlobalExpandIcon();
  saveAssignments();
}

function updateToolbarZoneUI() {
  const btn = document.getElementById('btnPageZone');
  if (!btn) return;
  const page = Store.getPages().find(p => p.id === Store.getCurrentPageId());
  if (page) {
    btn.textContent = page.rfZone || 'Select Zone';
    btn.classList.toggle('unselected', !page.rfZone);
    // Remove old listeners to avoid duplicates
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      PopupManager.openZoneSelector(e, page, newBtn, {
        zones: sharedState.parsedZones.map(z => z.name),
        isPage: true,
        onSave: saveAssignments,
        updateUI: updateToolbarZoneUI,
        onRender: renderPageCanvas
      });
    });
  }
}

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const pagesTabGroup = document.getElementById('pagesTabGroup');
const btnAddPage    = document.getElementById('btnAddPage');
const tabInventory  = document.getElementById('tabInventory');
const pageCanvas    = document.getElementById('pageCanvas');

// ─── Tab Navigation ───────────────────────────────────────────────────────────

export function isAnyEventExpanded() {
  const cid = Store.getCurrentPageId();
  const pageEvts = cid ? Store.getEvents(cid) : [];
  return (Array.isArray(pageEvts) ? pageEvts : []).some(ev => !ev.collapsed);
}

export function toggleAllEvents() {
  if (sharedState.recordSnapshot) sharedState.recordSnapshot();
  const pageEvts = Store.getEvents(Store.getCurrentPageId());
  if (pageEvts.length === 0) return;
  const anyOpen = pageEvts.some(ev => !ev.collapsed);
  const newState = anyOpen;
  pageEvts.forEach(ev => ev.collapsed = newState);
  saveAssignments();
  renderPageCanvas();
  if (window.updateGlobalExpandIcon) window.updateGlobalExpandIcon();
}

function getTabCallbacks() {
  return {
    container: pagesTabGroup,
    onSwitchView: switchView,
    onSave: saveAssignments,
    onDeletePage: (id) => TabManager.executeDeletePage(id, getTabCallbacks())
  };
}

export function renderPageTabs() {
  TabManager.renderPageTabs(pagesTabGroup, getTabCallbacks());
}

if (tabInventory) tabInventory.addEventListener('click', () => switchView('inventory'));

if (btnAddPage) {
  btnAddPage.addEventListener('click', () => {
    if (sharedState.recordSnapshot) sharedState.recordSnapshot();
    const page = { id: generateUID(), label: `Page ${Store.getPages().length + 1}`, rfZone: '' };
    Store.getPages().push(page);
    Store.setEvents(page.id, []);
    renderPageTabs();
    switchView(page.id);
    saveAssignments();
    
    // Auto-rename focus
    setTimeout(() => {
      const btn = pagesTabGroup.querySelector(`[data-page-id="${page.id}"]`);
      if (btn) TabManager.startRenameTab(btn, getTabCallbacks());
    }, 50);
  });
}

// ─── Render Wrapping ─────────────────────────────────────────────────────────

export function renderPageCanvas() {
  LayoutEngine.renderPageCanvas(pageCanvas, {
    saveAssignments,
    createEvent,
    deleteEvent,
    duplicateEvent,
    saveAsTemplate,
    renderPageCanvas
  });
}

// ─── Event Management ─────────────────────────────────────────────────────────

function createEvent(templateOrId = null) {
  if (sharedState.recordSnapshot) sharedState.recordSnapshot();
  // Accept either: a bare template object (from drawer) or an ID string (from session Store)
  let template = null;
  if (templateOrId) {
    if (typeof templateOrId === 'object') {
      template = templateOrId; // full object passed directly from TemplateDrawer
    } else {
      template = Store.getTemplates().find(t => t.id === templateOrId) || null;
    }
  }

  const deepCloneBlocks = (blocks) => {
    return blocks.map(b => {
      const newB = JSON.parse(JSON.stringify(b));
      newB.id = generateUID();
      if (newB.rows) newB.rows.forEach(r => r.id = generateUID());
      if (newB.items) newB.items.forEach(i => i.id = generateUID());
      return newB;
    });
  };

  const cid = Store.getCurrentPageId();
  const pageEvts = Store.getEvents(cid);
  const eventCount = pageEvts.length;
  const autoColor = EVENT_PALETTE[eventCount % EVENT_PALETTE.length];

  const evt = {
    id: generateUID(),
    name: template ? template.name : '',
    startTime: '',
    endTime: '',
    span: template ? (template.span || 1) : 1,
    color: autoColor,
    rfZone: '',
    collapsed: false,
    blocks: template ? deepCloneBlocks(template.blocks) : []
  };
  pageEvts.push(evt);
  saveAssignments();
  renderPageCanvas();
}

function deleteEvent(id) {
  if (sharedState.recordSnapshot) sharedState.recordSnapshot();
  const cid = Store.getCurrentPageId();
  const list = Store.getEvents(cid);
  Store.setEvents(cid, list.filter(e => e.id !== id));
  saveAssignments(); 
  renderPageCanvas();
}

function duplicateEvent(evt) {
  if (sharedState.recordSnapshot) sharedState.recordSnapshot();
  const clone = JSON.parse(JSON.stringify(evt));
  clone.id = generateUID();
  if (clone.blocks) {
    clone.blocks.forEach(b => {
      b.id = generateUID();
      if (b.rows) b.rows.forEach(r => r.id = generateUID());
      if (b.items) b.items.forEach(i => i.id = generateUID());
    });
  }
  const cid = Store.getCurrentPageId();
  const list = Store.getEvents(cid);
  const idx = list.indexOf(evt);
  if (idx !== -1) {
    list.splice(idx + 1, 0, clone);
  } else {
    list.push(clone);
  }
  saveAssignments();
  renderPageCanvas();
  PopupManager.showToast("Event duplicated!");
}

function saveAsTemplate(evt) {
  PopupManager.showCustomPrompt('Save as Template', 'Enter a name for this template:', evt.name || '', async (n) => {
    if (!n) return;

    let existingTemplates = Store.getTemplates();
    if (window.templateAPI) {
      try { 
        existingTemplates = await window.templateAPI.getTemplates(); 
        // Sync local Store with backend truth to prevent out-of-sync bugs
        const local = Store.getTemplates();
        local.splice(0, local.length, ...existingTemplates);
      } catch (e) {
        console.error('Failed to grab backend templates for duplicate checking', e);
      }
    }

    const duplicate = existingTemplates.find(t => t.name.toLowerCase() === n.toLowerCase());
    
    if (duplicate) {
      return `A template named "${duplicate.name}" already exists.`;
    }

    const templateBlocks = evt.blocks.map(b => {
      // ── Layout properties MUST be preserved ──────────────────────────────────
      // b.span: 2 = full-width block, absent/1 = normal
      // b.side: 'left' | 'right' = column placement in a full-width event
      // Without these, all blocks reset to default (half-width, left column) on injection.
      const structuralBlock = {
        id: generateUID(),
        type: b.type,
        ...(b.span  !== undefined && { span: b.span  }),  // full-width flag
        ...(b.side  !== undefined && { side: b.side  }),  // column placement
      };

      // Content: keep structural shape, wipe personal data
      if (b.type === 'assignment') {
        structuralBlock.rows = (b.rows || []).map(() => ({
          id: generateUID(), personName: '', deviceLabel: '', rfChannelId: null
        }));
      } else if (b.type === 'note') {
        structuralBlock.content = '';
      } else if (b.type === 'checklist') {
        structuralBlock.items = (b.items || []).map(() => ({
          id: generateUID(), label: '', checked: false
        }));
      }
      return structuralBlock;
    });

    const templateData = { 
      id: `tpl_${Date.now()}`,
      name: n, 
      span: evt.span || 1, 
      blocks: templateBlocks 
    };

    // 1. Persist to disk via IPC (survives restarts)
    if (window.templateAPI) {
      await window.templateAPI.saveTemplate(templateData);
    }

    // 2. Also keep in local session Store so it's immediately usable
    Store.getTemplates().push(templateData);
    saveAssignments();
    PopupManager.showToast(`Template "${n}" saved!`);
  });
}

// ─── Entry Point ─────────────────────────────────────────────────────────────

export async function initAssignments() {
  loadAssignments();
  await TemplateDrawer.refreshQuickAccess();
  renderPageTabs();
  const restoreOn = localStorage.getItem('node_rf_restore_on_startup') === 'true';
  const lastView = Store.getLastView();
  const startView = (restoreOn && lastView) ? lastView : 'inventory';
  switchView(startView);

  EventInteractions.init(pageCanvas);
  BlockInteractions.init(pageCanvas);

  EventHub.on('requestRender', () => {
    renderPageCanvas();
  });
}
