/**
 * TabManager.js - Manages page tab rendering, renaming, and deletion.
 * IMPORTANT: This module ONLY manages the #pagesTabGroup container.
 * The #tabInventory button is STATIC in the HTML and must never be touched here.
 */
import { Store } from '../core/Store.js';
import { sharedState } from '../core/StateProvider.js';
import * as PopupManager from './PopupManager.js';
let _onSwitchView = null;

export const TabManager = {
  /**
   * Renders dynamic page tabs into the provided container (ONLY #pagesTabGroup).
   */
  renderPageTabs(container, callbacks) {
    if (!container) return;
    _onSwitchView = callbacks.onSwitchView;
    container.innerHTML = '';
    
    Store.getPages().filter(p => !p.isDeleted).forEach(page => {
      const wrapper = document.createElement('div');
      wrapper.className = 'page-tab-wrapper';
      wrapper.draggable = true;
      wrapper.dataset.pageId = page.id;

      const btn = document.createElement('button');
      btn.className = 'view-tab page-tab-btn';
      btn.dataset.pageId = page.id;
      btn.textContent = page.label;
      if (page.id === Store.getCurrentPageId()) btn.classList.add('active');
      
      btn.addEventListener('click', () => callbacks.onSwitchView(page.id));
      btn.addEventListener('dblclick', () => this.startRenameTab(btn, callbacks));

      wrapper.appendChild(btn);

      // ─── Drag & Drop Reordering ───────────────────────────────────────────
      wrapper.addEventListener('dragstart', (e) => {
        wrapper.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', page.id);
      });

      wrapper.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const dragging = container.querySelector('.dragging');
        if (dragging && dragging !== wrapper) {
            const rect = wrapper.getBoundingClientRect();
            const next = (e.clientY - rect.top) > (rect.height / 2);
            
            let placeholder = container.querySelector('.drag-placeholder');
            if (!placeholder) {
                placeholder = document.createElement('div');
                placeholder.className = 'drag-placeholder';
            }
            if (next) wrapper.after(placeholder);
            else wrapper.before(placeholder);
        }
      });

      wrapper.addEventListener('drop', (e) => {
        e.preventDefault();
        const dragging = container.querySelector('.dragging');
        const placeholder = container.querySelector('.drag-placeholder');
        if (dragging && placeholder) {
            placeholder.replaceWith(dragging);
        }
        
        const newOrder = Array.from(container.querySelectorAll('.page-tab-wrapper'))
                              .map(w => w.dataset.pageId);
        document.dispatchEvent(new CustomEvent('pages:reordered', { 
            detail: { newOrder } 
        }));
      });

      wrapper.addEventListener('dragend', () => {
        wrapper.classList.remove('dragging');
        const placeholder = container.querySelector('.drag-placeholder');
        if (placeholder) placeholder.remove();
      });

      wrapper.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        document.dispatchEvent(new CustomEvent('tab:contextmenu', {
          detail: {
            pageId: page.id,
            x: e.clientX,
            y: e.clientY,
            target: btn
          }
        }));
      });

      container.appendChild(wrapper);
    });
  },

  /**
   * Replaces a tab button with an input field for renaming.
   */
  startRenameTab(btn, callbacks) {
    const pageId = btn.dataset.pageId;
    const page = Store.getPages().find(p => p.id === pageId);
    if (!page) return;

    const btnWidth = btn.offsetWidth;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = page.label;
    input.className = 'view-tab tab-rename-input';
    input.style.cssText = `border:1px solid var(--primary); outline:none; background:var(--bg-surface); font-size:0.78rem; font-weight:600; color:var(--text-main); width:${Math.max(120, btnWidth)}px; padding: 4px 8px; border-radius: 4px; box-shadow: 0 0 0 3px var(--primary-low-alpha);`;
    
    btn.replaceWith(input);
    input.focus(); 
    input.select();
    
    let committed = false;
    const commit = () => {
      if (committed) return;
      committed = true;
      const newLabel = input.value.trim();
      if (newLabel && newLabel !== page.label) {
        page.label = newLabel;
        Store._forceNextSnapshot = true;
        callbacks.onSave();
      }
      const container = document.getElementById('pagesTabGroup');
      this.renderPageTabs(container, callbacks);
    };
    
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', e => { 
      if (e.key === 'Enter') input.blur(); 
      if (e.key === 'Escape') { input.value = page.label; input.blur(); } 
    });
  },

  /**
   * Executes page deletion with state updates.
   */
  executeDeletePage(pageId, callbacks) {
    if (sharedState.recordSnapshot) sharedState.recordSnapshot();
    const pages = Store.getPages().filter(p => p.id !== pageId);
    Store.setPages(pages);
    
    const allEvents = Store.getEvents();
    delete allEvents[pageId];

    if (Store.getCurrentPageId() === pageId) {
      Store.setCurrentPageId(pages[0]?.id || null);
    }

    this.renderPageTabs(callbacks.container, callbacks);
    callbacks.onSave();
    
    if (Store.getCurrentPageId()) {
      callbacks.onSwitchView(Store.getCurrentPageId());
    } else {
      callbacks.onSwitchView('inventory');
    }
  }
};

// ─── Keyboard Navigation (Data-Driven) ─────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey) {
    const digitMatch = e.code.match(/^Digit([1-9])$/);
    if (!digitMatch) return;
    
    e.preventDefault();
    if (!_onSwitchView) return; // Safety check

    const num = parseInt(digitMatch[1], 10);
    
    if (num === 1) {
      _onSwitchView('inventory');
    } else {
      const pages = Store.getPages();
      const targetIdx = num - 2; // Ctrl+2 -> num=2 -> index 0 (Page 1)
      if (pages[targetIdx]) {
        _onSwitchView(pages[targetIdx].id);
      }
    }
  }
});
