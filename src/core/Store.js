/**
 * Store.js — Data management and Persistence
 */
import { sharedState } from './StateProvider.js';

export const Store = {
  data: {
    assignPages: [],
    assignEvents: {},
    assignTemplates: [],
    lastView: null
  },
  past: [],
  future: [],
  lastKnownState: null,

  _getA: (key) => (Store.data.assignments ? Store.data.assignments[key] : Store.data[key]),
  _setA: (key, val) => {
    if (Store.data.assignments) Store.data.assignments[key] = val;
    else Store.data[key] = val;
  },

  getPages: () => Store._getA('assignPages') || [],
  setPages: (val) => Store._setA('assignPages', val),
  
  getEvents: (pageId) => {
    const events = Store._getA('assignEvents') || {};
    if (pageId) return events[pageId] || [];
    return events;
  },
  setEvents: (pageId, val) => { 
    const events = Store._getA('assignEvents') || {};
    if (typeof pageId === 'string') {
        events[pageId] = val;
        Store._setA('assignEvents', events);
    } else {
        Store._setA('assignEvents', pageId || {}); 
    }
  },
  
  getTemplates: () => Store._getA('assignTemplates') || [],
  setTemplates: (val) => Store._setA('assignTemplates', val),
  
  // session only for now, not tracked in history if not part of data
  _currentPageId: null,
  getCurrentPageId: () => Store._currentPageId,
  setCurrentPageId: (val) => { Store._currentPageId = val; },
  
  getLastView: () => Store._getA('lastView'),
  setLastView: (val) => Store._setA('lastView', val),

  migrate() {
    const pages = Store.getPages();
    const events = Store.getEvents();
    
    pages.forEach(p => { if (p.rfZone === undefined) p.rfZone = ''; });
    Object.keys(events).forEach(pageId => {
      events[pageId].forEach(evt => {
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
  isRestoring: false,
  _lastSnapshotTime: 0, // Chrono pour le throttling (Undo par blocs)
  _forceNextSnapshot: false, // Espace ou blur force
  lastKnownActiveView: null,
  __tempRestoredView: null,

  _getActiveView() {
    const isInventory = document.getElementById('inventoryView')?.classList.contains('active');
    return isInventory ? 'inventory' : Store.getCurrentPageId();
  },

  _getComparableState(data) {
    if (!data) return null;
    // Destructuring to exclude volatile keys from comparison
    const { updatedAt, lastSaved, selectedEventId, activeTab, savedAt, ...rest } = data;
    return JSON.stringify(rest);
  },

  getStateSnapshot() {
    const lastView = document.getElementById('inventoryView')?.classList.contains('active') ? 'inventory' : Store._currentPageId;
    return { 
      assignPages: Store.getPages(), 
      assignEvents: Store.getEvents(), 
      assignTemplates: Store.getTemplates(), 
      lastView 
    };
  },

  save(newData) {
    if (this.isRestoring) return; // Mission: Bloquer tout snapshot pendant la restauration

    // 1. Snapshot SYNCHRONE avec comparaison métier et Throttle (800ms) ou Force (Espace)
    const stateToCompare = newData !== undefined ? newData : this.data;
    const now = Date.now();
    const shouldSnapshot = this._forceNextSnapshot || (now - (this._lastSnapshotTime || 0) > 800);
    
    // On ne prend un snapshot que si le délai est dépassé (ou forcé par blur/espace)
    if (shouldSnapshot) {
        const currentBusinessStr = this._getComparableState(stateToCompare);
        const lastBusinessStr = this.lastKnownState ? this._getComparableState(this.lastKnownState) : null;

        const hasChanged = currentBusinessStr !== lastBusinessStr;
        console.log('DIFF:', hasChanged); // Debug Console for audit

        if (hasChanged) {
            this.past.push({
                data: structuredClone(this.lastKnownState || this.data),
                activeView: this.lastKnownActiveView
            }); // Pousse l'état complet avec contexte UI
            if (this.past.length > 50) this.past.shift();
            this.future = [];
            this.lastKnownState = structuredClone(stateToCompare);
            this.lastKnownActiveView = this._getActiveView();
            this._lastSnapshotTime = now; // Met à jour le chrono
        }
        this._forceNextSnapshot = false; // Reset systématique du flag
    }

    // 2. Mutation en mémoire
    if (newData !== undefined) this.data = newData;

    // 3. Suite normale - Persistence
    try {
      if (newData !== undefined) {
        localStorage.setItem('node_rf_autosave', JSON.stringify(this.data));
      } else {
        localStorage.setItem('node_rf_assignments', JSON.stringify(this.getStateSnapshot()));
        if (sharedState.requestAutosave) sharedState.requestAutosave();
      }
    } catch(e) { console.warn('Store save failed', e); }
  },

  _persistOnly(data) {
    if (data) this.data = data;
    try {
      // Immediate persistence without debouncing/autosave trigger
      localStorage.setItem('node_rf_assignments', JSON.stringify(this.getStateSnapshot()));
      // Placeholder for immediate IPC save if needed in the future
      if (window.electronFS?.invoke) {
        // window.electronFS.invoke('save-assignments-immediate', this.data);
      }
    } catch(e) { console.warn('Store immediate persist failed', e); }
  },

  undo() {
    if (this.past.length === 0) return;

    this.future.unshift({
        data: structuredClone(this.data),
        activeView: this._getActiveView()
    });
    const snapshot = this.past.pop();
    this.data = snapshot.data;
    this.lastKnownState = structuredClone(this.data);
    this.lastKnownActiveView = snapshot.activeView;
    this.__tempRestoredView = snapshot.activeView;

    this._persistOnly(this.data);
    return this.data;
  },

  redo() {
    if (this.future.length === 0) return;

    this.past.push({
        data: structuredClone(this.data),
        activeView: this._getActiveView()
    });
    const snapshot = this.future.shift();
    this.data = snapshot.data;
    this.lastKnownState = structuredClone(this.data);
    this.lastKnownActiveView = snapshot.activeView;
    this.__tempRestoredView = snapshot.activeView;

    this._persistOnly(this.data);
    return this.data;
  },

  load() {
    const raw = localStorage.getItem('node_rf_assignments');
    if (!raw) {
        // Still initialize lastKnownState to avoid null comparison issues
        this.lastKnownState = structuredClone(this.data);
        return;
    }
    try {
      const data = JSON.parse(raw);
      this.data.assignPages     = data.assignPages || [];
      this.data.assignEvents    = data.assignEvents || {};
      this.data.assignTemplates = data.assignTemplates || [];
      this.data.lastView        = data.lastView || null;
      this.migrate();
      
      // Initialize history state
      this.lastKnownState = structuredClone(this.data);
      this.lastKnownActiveView = this._getActiveView();
      this._lastSnapshotTime = 0;
    } catch(e) { console.warn('Store load failed', e); }
  },

  clonePage(pageId) {
    const pages = Store.getPages();
    const pageIndex = pages.findIndex(p => p.id === pageId);
    if (pageIndex === -1) return null;

    const originalPage = pages[pageIndex];
    const newPageId = 'page-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
    const clonedPage = structuredClone(originalPage);
    
    clonedPage.id = newPageId;
    clonedPage.name = (clonedPage.name || 'Page') + ' (Copy)';
    
    // Clone events for this page
    const originalEvents = Store.getEvents(pageId);
    const clonedEvents = structuredClone(originalEvents);
    
    // Generate new IDs for all events in the cloned page to avoid collisions
    clonedEvents.forEach(evt => {
      evt.id = 'evt-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    });

    // Update all events map
    const allEvents = Store.getEvents();
    allEvents[newPageId] = clonedEvents;
    Store.setEvents(allEvents);

    // Insert new page after original
    pages.splice(pageIndex + 1, 0, clonedPage);
    Store.setPages(pages);
    
    Store._forceNextSnapshot = true;
    Store.save();
    return newPageId;
  }
};
