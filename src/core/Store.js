/**
 * Store.js — Data management and Persistence
 */
import { sharedState } from './StateProvider.js';

// State Variables
let assignPages = [];      
let assignEvents = {};     
let assignTemplates = [];  
let currentPageId = null;
let lastStoredView = null;

/** Persistence Logic */

export const Store = {
  getPages: () => assignPages,
  setPages: (val) => { assignPages = val; },
  
  getEvents: (pageId) => {
    if (pageId) return assignEvents[pageId] || [];
    return assignEvents;
  },
  setEvents: (pageId, val) => { 
    if (typeof pageId === 'string') assignEvents[pageId] = val;
    else assignEvents = pageId || {}; // Bulk set with fallback
  },
  
  getTemplates: () => assignTemplates,
  setTemplates: (val) => { assignTemplates = val; },
  
  getCurrentPageId: () => currentPageId,
  setCurrentPageId: (val) => { currentPageId = val; },
  
  getLastView: () => lastStoredView,
  setLastView: (val) => { lastStoredView = val; },

  migrate() {
    assignPages.forEach(p => { if (p.rfZone === undefined) p.rfZone = ''; });
    Object.keys(assignEvents).forEach(pageId => {
      assignEvents[pageId].forEach(evt => {
        if (evt.span === undefined) {
          evt.span = (evt.spanFull ? 2 : 1);
          delete evt.spanFull;
        } else if (evt.span > 2) {
          evt.span = evt.span > 6 ? 2 : 1;
        }
        if (evt.showTimes !== undefined) delete evt.showTimes;
        if (evt.rfZone !== undefined) delete evt.rfZone;
        if (evt.collapsed === undefined) evt.collapsed = false;
        if (evt.blocks === undefined) evt.blocks = [];
      });
    });
  },

  getStateSnapshot() {
    const lastView = document.getElementById('inventoryView')?.classList.contains('active') ? 'inventory' : currentPageId;
    return { assignPages, assignEvents, assignTemplates, lastView };
  },

  save() {
    try {
      localStorage.setItem('node_rf_assignments', JSON.stringify(this.getStateSnapshot()));
      if (sharedState.requestAutosave) sharedState.requestAutosave();
    } catch(e) { console.warn('Store save failed', e); }
  },

  load() {
    const raw = localStorage.getItem('node_rf_assignments');
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      assignPages     = data.assignPages || [];
      assignEvents    = data.assignEvents || {};
      assignTemplates = data.assignTemplates || [];
      lastStoredView  = data.lastView || null;
      this.migrate();
    } catch(e) { console.warn('Store load failed', e); }
  }
};
