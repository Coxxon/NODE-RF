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
    
    Store.getPages().forEach(page => {
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

      const closeBtn = document.createElement('button');
      closeBtn.className = 'page-tab-close';
      closeBtn.title = 'Delete page';
      closeBtn.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
      
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (closeBtn.dataset.confirmed === 'true') {
          if (closeBtn.dataset.armed !== 'true') return;
          callbacks.onDeletePage(page.id);
        } else {
          PopupManager.closeAllPopups();
          closeBtn.dataset.confirmed = 'true';
          closeBtn.dataset.armed = 'false';
          closeBtn.innerHTML = 'CONFIRM?';
          closeBtn.classList.add('confirm-danger');
          
          setTimeout(() => { closeBtn.dataset.armed = 'true'; }, 400);
          
          const reset = (clickAny) => {
            if (clickAny.target !== closeBtn) {
              closeBtn.dataset.confirmed = 'false';
              closeBtn.dataset.armed = 'false';
              closeBtn.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
              closeBtn.classList.remove('confirm-danger');
              document.removeEventListener('mousedown', reset);
            }
          };
          setTimeout(() => document.addEventListener('mousedown', reset), 10);
        }
      });

      wrapper.appendChild(btn);
      wrapper.appendChild(closeBtn);

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
        this.showContextMenu(e.clientX, e.clientY, page.id, container, callbacks);
      });

      container.appendChild(wrapper);
    });
  },

  showContextMenu(x, y, pageId, container, callbacks) {
    document.querySelectorAll('.custom-context-menu').forEach(el => el.remove());
    
    const menu = document.createElement('div');
    menu.className = 'custom-context-menu';
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    
    const item = document.createElement('div');
    item.className = 'context-menu-item';
    item.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:8px; opacity:0.7;">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg>
      Dupliquer la page
    `;
    item.addEventListener('click', () => {
      const newPageId = Store.clonePage(pageId);
      if (newPageId) {
        this.renderPageTabs(container, callbacks);
        callbacks.onSwitchView(newPageId);
      }
      menu.remove();
    });
    
    menu.appendChild(item);
    document.body.appendChild(menu);
    
    const clickOutside = (e) => {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('mousedown', clickOutside);
      }
    };
    document.addEventListener('mousedown', clickOutside);
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
    input.style.cssText = `border:none;outline:none;background:transparent;font-size:0.78rem;font-weight:500;color:var(--primary);width:${Math.max(120, btnWidth)}px;padding-right:28px;`;
    
    btn.replaceWith(input);
    input.focus(); 
    input.select();
    
    let committed = false;
    const commit = () => {
      if (committed) return;
      committed = true;
      page.label = input.value.trim() || page.label;
      // Re-target the container via the stable DOM ID
      const container = document.getElementById('pagesTabGroup');
      this.renderPageTabs(container, callbacks);
      callbacks.onSave();
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
