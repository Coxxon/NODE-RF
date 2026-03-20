/**
 * LayoutEngine.js — Manages canvas rendering and DOM generation for Events and Blocks.
 */
import { Store } from '../core/Store.js';
import { ConflictManager } from '../core/ConflictManager.js';
import * as PopupManager from './PopupManager.js';
import { BlockFactory } from './blocks/BlockFactory.js';
import { EVENT_PALETTE } from '../core/Constants.js';
import { getRFInfo, getAllRFChannels } from '../core/RFUtils.js';
import { handleVerticalNavigation, generateUID } from '../utils.js';
import { TemplateDrawer } from './TemplateDrawer.js';

import { buildAssignmentBody } from './blocks/variants/AssignmentBlock.js';
import { buildNoteBody, buildNoteToolbar } from './blocks/variants/NoteBlock.js';
import { buildChecklistBody } from './blocks/variants/ChecklistBlock.js';
import { buildHeaderBlockBody } from './blocks/variants/SectionHeaderBlock.js';
import { buildContactBlockBody } from './blocks/variants/ContactBlock.js';
import { buildFileBlockBody } from './blocks/variants/FileBlock.js';

import { BlockInteractions } from './interactions/BlockInteractions.js';

export const LayoutEngine = {
  /**
   * Renders the entire page canvas.
   */
  renderPageCanvas(pageCanvas, callbacks) {
    if (!pageCanvas) return;
    pageCanvas.innerHTML = '';
    
    const pageId = Store.getCurrentPageId();
    if (!pageId) return;

    const events = Store.getEvents(pageId) || [];
    
    if (events.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'canvas-empty-state';
      empty.innerHTML = `
        <div class="canvas-empty-icon">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>
        </div>
        <h3>No events on this page</h3>
        <p>Start by creating your first technical event.</p>
      `;
      pageCanvas.appendChild(empty);
      // Split button in empty state
      const split = this.buildAddEventSplitBtn(callbacks);
      split.style.marginTop = '12px';
      empty.appendChild(split);
      return;
    }

    events.forEach(evt => {
      const el = this.buildEventElement(evt, callbacks);
      pageCanvas.appendChild(el);
    });

    const addSplit = this.buildAddEventSplitBtn(callbacks);
    pageCanvas.appendChild(addSplit);

    ConflictManager.checkConflicts();
  },

  /**
   * Builds the split '+ New Event / chevron' button.
   * Left: creates a blank event. Middle: container for dynamic templates. Right: drawer toggle.
   */
  buildAddEventSplitBtn(callbacks) {
    const wrapper = document.createElement('div');
    wrapper.className = 'btn-split-add';
    wrapper.style.cssText = 'grid-column:1/-1; display:flex; align-items:center; margin:16px auto;';

    const mainBtn = document.createElement('button');
    mainBtn.className = 'btn-split-add__main';
    mainBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg> New Event`;
    mainBtn.addEventListener('click', () => callbacks.createEvent(null));

    // Dynamic shell for quick access shortcuts
    const quickContainer = document.createElement('div');
    quickContainer.className = 'quick-access-container';
    
    const chevronBtn = document.createElement('button');
    chevronBtn.className = 'btn-split-add__chevron';
    chevronBtn.title = 'Create from template';
    chevronBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m6 9 6 6 6-6"/></svg>`;
    chevronBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      TemplateDrawer.open(callbacks.createEvent);
    });

    wrapper.append(mainBtn, quickContainer, chevronBtn);

    return wrapper;
  },

  /**
   * Builds the DOM for a single Event block.
   */
  buildEventElement(evt, callbacks) {
    const el = document.createElement('div');
    el.className = 'event-block';
    if (evt.collapsed) el.classList.add('collapsed');
    const span = evt.span || 1;
    el.style.gridColumn = `span ${span}`;
    el.dataset.eventId = evt.id;

    const dragHandle = document.createElement('div');
    dragHandle.className = 'event-drag-handle';
    el.appendChild(dragHandle);

    el.draggable = false;

    const header = document.createElement('div');
    header.className = 'event-header';
    if (evt.color) {
      // 10% opacity wash (Hex append '1A')
      header.style.background = evt.color + '1A';
      header.style.borderBottom = `1.5px solid ${evt.color}`;
    }

    const collapseBtn = document.createElement('button');
    collapseBtn.className = 'event-collapse-btn';
    
    const updateCollapseIcon = () => {
      collapseBtn.innerHTML = evt.collapsed 
        ? `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right"><path d="m9 18 6-6-6-6"/></svg>`
        : `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-down"><path d="m6 9 6 6 6-6"/></svg>`;
    };
    updateCollapseIcon();

    collapseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      evt.collapsed = !evt.collapsed;
      el.classList.toggle('collapsed', evt.collapsed);
      updateCollapseIcon();
      callbacks.saveAssignments();
      if (window.updateGlobalExpandIcon) window.updateGlobalExpandIcon();
    });

    const dot = document.createElement('div');
    dot.className = 'event-color-dot';
    dot.style.background = evt.color;
    dot.addEventListener('click', (e) => { 
      e.stopPropagation(); 
      PopupManager.openColorPicker(e, evt, dot, callbacks.saveAssignments); 
    });

    const nameInput = document.createElement('input');
    nameInput.type = 'text'; nameInput.className = 'event-name-input';
    nameInput.value = evt.name; nameInput.placeholder = 'Sequence name';
    nameInput.addEventListener('input', () => { 
      evt.name = nameInput.value; 
      callbacks.saveAssignments(); 
      ConflictManager.checkConflicts(); 
    });
    nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') nameInput.blur(); });

    const conflictDot = document.createElement('div');
    conflictDot.className = 'event-conflict-dot';
    conflictDot.dataset.conflictTarget = evt.id;
    conflictDot.addEventListener('mouseenter', (e) => ConflictManager.showConflictTooltip(e, conflictDot));
    conflictDot.addEventListener('mouseleave', () => ConflictManager.hideConflictTooltip());

    const timeGroup = document.createElement('div');
    timeGroup.className = 'event-time-group';

    const formatTimeInput = (input, key) => {
      input.addEventListener('blur', (e) => {
        let val = e.target.value.replace(/[:]/g, 'h').replace(/[^0-9h]/g, '');
        if (!val) return;
        if (!val.includes('h')) {
          if (val.length === 4) {
            val = val.slice(0, 2) + 'h' + val.slice(2);
          } else if (val.length === 3) {
            val = val[0] + 'h' + val.slice(1);
          } else {
            val = val + 'h00';
          }
        }
        const parts = val.split('h');
        let hNum = parseInt(parts[0] || '0') % 24;
        let mNum = Math.min(59, parseInt(parts[1] || '0'));
        val = `${hNum}h${mNum.toString().padStart(2, '0')}`;
        e.target.value = val;
        evt[key] = val;
        callbacks.saveAssignments(); ConflictManager.checkConflicts();
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') input.blur();
      });
    };

    const startInput = document.createElement('input');
    startInput.type = 'text'; startInput.className = 'event-time-input';
    startInput.value = evt.startTime; startInput.placeholder = 'Start';
    formatTimeInput(startInput, 'startTime');

    const endInput = document.createElement('input');
    endInput.type = 'text'; endInput.className = 'event-time-input';
    endInput.value = evt.endTime; endInput.placeholder = 'End';
    formatTimeInput(endInput, 'endTime');

    const arrowIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8L22 12L18 16"/><path d="M2 12H22"/></svg>`;
    const arrowSpan = document.createElement('span');
    arrowSpan.innerHTML = arrowIcon;
    arrowSpan.className = 'event-header-arrow';
    arrowSpan.style.display = 'flex';
    arrowSpan.style.alignItems = 'center';
    arrowSpan.style.color = 'var(--text-muted)';

    timeGroup.append(startInput, arrowSpan, endInput);

    const eventResizer = document.createElement('button');
    eventResizer.className = 'event-resizer-btn';
    const evSpan = evt.span || 1;
    eventResizer.title = evSpan === 2 ? 'Switch to Half Width' : 'Switch to Full Width';
    
    const iconHalfEv = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="m6 17 5-5-5-5"/><path d="m13 17 5-5-5-5"/>
      </svg>
    `;
    const iconFullEv = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="m11 17-5-5 5-5"/><path d="m18 17-5-5 5-5"/>
      </svg>
    `;
    
    eventResizer.innerHTML = evSpan === 2 ? iconFullEv : iconHalfEv;
    eventResizer.addEventListener('click', (e) => {
      e.stopPropagation();
      evt.span = (evt.span === 2) ? 1 : 2;
      if (evt.span === 1) {
         (evt.blocks || []).forEach(b => delete b.side);
      }
      callbacks.saveAssignments();
      callbacks.renderPageCanvas();
    });

    const menuBtn = document.createElement('button');
    menuBtn.className = 'event-menu-btn';
    menuBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>`;
    menuBtn.addEventListener('click', (e) => { 
      e.stopPropagation(); 
      PopupManager.openEventContextMenu(e, evt, {
        onDuplicate: callbacks.duplicateEvent,
        onSaveAsTemplate: callbacks.saveAsTemplate,
        onDelete: callbacks.deleteEvent
      }); 
    });

    header.append(collapseBtn, dot, nameInput, conflictDot, timeGroup, eventResizer, menuBtn);
    el.appendChild(header);

    const body = document.createElement('div');
    body.className = 'event-body';
    this.renderBlocks(body, evt, (b, e) => this.buildBlockElement(b, e, callbacks));
    el.appendChild(body);

    const footer = document.createElement('div');
    footer.className = 'event-footer';
    const addBlockBtn = document.createElement('button');
    addBlockBtn.className = 'btn-add-block';
    addBlockBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg> Add block`;
    addBlockBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      PopupManager.openBlockAddMenu(e, evt, addBlockBtn, {
        generateUID,
        onSave: callbacks.saveAssignments,
        onRender: callbacks.renderPageCanvas
      });
    });
    footer.appendChild(addBlockBtn);
    el.appendChild(footer);

    return el;
  },

  /**
   * Builds the DOM for an internal block.
   */
  buildBlockElement(block, evt, callbacks) {
    const LABELS = { 
      assignment: 'Assignment', 
      note: 'Note', 
      checklist: 'Checklist',
      header: 'Section Title',
      contact: 'Contacts',
      file: 'File Block'
    };

    const blockCallbacks = {
      label: LABELS[block.type] || block.type,
      onDragStart: (e, b, ev, el) => BlockInteractions.handleDragStart(e, b, ev, el),
      onDragOver: (e, el, ev) => BlockInteractions.handleDragOver(e, el, ev),
      onDragEnd: (e, el) => BlockInteractions.handleDragEnd(el),
      onDrop: (e, ev) => BlockInteractions.handleDrop(e, ev),
      onToggleCollapse: (b) => {
        callbacks.saveAssignments();
        callbacks.renderPageCanvas();
      },
      onResize: () => {
        callbacks.saveAssignments();
        callbacks.renderPageCanvas();
      },
      onDelete: (id) => {
        evt.blocks = evt.blocks.filter(b => b.id !== id); 
        callbacks.saveAssignments(); 
        callbacks.renderPageCanvas(); 
      },
      onSave: (e) => callbacks.saveAssignments(e),
      onRender: () => callbacks.renderPageCanvas(),
      onOpenColorPicker: (e, anchor) => PopupManager.openNoteColorPicker(e, anchor, callbacks.saveAssignments),
      buildRow: (row, b, e) => this.buildAssignmentRow(row, b, e, callbacks),
      buildHeaderExtras: (b, e) => {
        const frag = document.createDocumentFragment();
        if (['assignment', 'contact', 'checklist'].includes(b.type)) {
          const addBtn = document.createElement('button');
          addBtn.className = 'header-add-btn';
          addBtn.title = 'Add Item';
          addBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
          addBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            if (b.type === 'assignment') {
              if (!b.rows) b.rows = [];
              b.rows.push({ id: generateUID(), personName: '', deviceLabel: '', rfChannelId: null });
            } else if (b.type === 'contact') {
              if (!b.rows) b.rows = [];
              b.rows.push({ id: generateUID(), role: '', name: '', info: '' });
            } else if (b.type === 'checklist') {
              if (!b.items) b.items = [];
              b.items.push({ label: '', checked: false, id: generateUID() });
            }
            callbacks.saveAssignments();
            callbacks.renderPageCanvas();
          });
          frag.appendChild(addBtn);
        }

        if (b.type === 'file') {
          const importBtn = document.createElement('button');
          importBtn.className = 'header-add-btn';
          importBtn.title = 'Import Local File';
          importBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>`;
          
          const fileInput = document.createElement('input');
          fileInput.type = 'file';
          fileInput.accept = '.pdf, image/*';
          fileInput.style.display = 'none';
          
          fileInput.onchange = (ev) => {
            const files = ev.target.files;
            if (files && files.length > 0) {
              const file = files[0];
              
              // Use Electron's webUtils API (exposed via preload/contextBridge).
              // This is the correct method for Electron v32+ with contextIsolation.
              let nativePath = null;
              if (window.electronFS?.getPathForFile) {
                try { nativePath = window.electronFS.getPathForFile(file); } catch(e) { /* not Electron */ }
              }

              // Never persist blob: URLs — they expire on session close.
              if (!nativePath) {
                const errDiv = document.createElement('div');
                errDiv.style.cssText = 'position:fixed; bottom:20px; left:50%; transform:translateX(-50%); background:#ef4444; color:white; padding:10px 20px; border-radius:8px; font-size:0.8rem; z-index:9999; font-weight:700;';
                errDiv.textContent = '⚠ Native file path not accessible. File not saved.';
                document.body.appendChild(errDiv);
                setTimeout(() => errDiv.remove(), 4000);
                return;
              }

              if (!b.items) b.items = [];
              b.items.push({
                id: generateUID(),
                displayName: file.name,
                filePath: nativePath,
                type: file.type.includes('pdf') ? 'pdf' : 'image',
                expanded: false
              });
              callbacks.saveAssignments();
              callbacks.renderPageCanvas();
            }
          };

          importBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            fileInput.click();
          });
          
          frag.appendChild(importBtn);
          frag.appendChild(fileInput);
        }

        if (b.type === 'note') frag.appendChild(buildNoteToolbar(b, e, blockCallbacks));
        return frag;
      }
    };

    const variantMap = {
      assignment: buildAssignmentBody,
      note: buildNoteBody,
      checklist: buildChecklistBody,
      header: buildHeaderBlockBody,
      contact: buildContactBlockBody,
      file: buildFileBlockBody
    };

    const renderer = variantMap[block.type];
    if (!renderer) return document.createElement('div');

    const el = BlockFactory.createBlock(block, evt, (b, e) => renderer(b, e, blockCallbacks), blockCallbacks);
    
    // Grid settings
    const span = block.span || (block.type === 'header' ? 2 : 1);
    el.style.gridColumn = `span ${span}`;
    if (span === 2) el.classList.add('full-width');
    
    return el;
  },

  /**
   * Builds an assignment row.
   */
  buildAssignmentRow(row, block, evt, callbacks) {
    const rowEl = document.createElement('div');
    rowEl.className = 'block-row assignment-row';
    rowEl.dataset.rowId = row.id;
    
    const isLast = block.rows && block.rows[block.rows.length - 1].id === row.id;
    if (isLast) rowEl.classList.add('is-last-row');

    const conflictInd = document.createElement('div');
    conflictInd.className = 'line-conflict-indicator';
    conflictInd.textContent = 'ALERT';
    conflictInd.addEventListener('mouseenter', (e) => ConflictManager.showConflictTooltip(e, conflictInd));
    conflictInd.addEventListener('mouseleave', ConflictManager.hideConflictTooltip);

    const pIn = document.createElement('input');
    pIn.className = 'block-field'; 
    pIn.value = row.personName || ''; 
    pIn.placeholder = 'Name';
    pIn.addEventListener('input', () => { 
      row.personName = pIn.value; 
      callbacks.saveAssignments(); 
      ConflictManager.checkConflicts(); 
    });
    pIn.addEventListener('keydown', (e) => { 
      if (e.key === 'Enter') pIn.blur();
      handleVerticalNavigation(e, '.block-field:not(.device-field)');
    });

    const dIn = document.createElement('input');
    dIn.className = 'block-field device-field'; 
    dIn.value = row.deviceLabel || ''; 
    dIn.placeholder = 'Device #';
    dIn.addEventListener('input', () => { 
      row.deviceLabel = dIn.value; 
      callbacks.saveAssignments(); 
      ConflictManager.checkConflicts(); 
    });
    dIn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') dIn.blur();
      handleVerticalNavigation(e, '.device-field');
    });

    const rfB = document.createElement('button');
    rfB.className = 'rf-link-badge' + (row.rfChannelId ? '' : ' unlinked');
    const info = getRFInfo(row.rfChannelId);
    if (info) {
      const displayFreq = info.freq ? info.freq.replace(/\s*mhz/gi,'') : '?.??';
      rfB.innerHTML = `<div class="rf-freq-line">${displayFreq} MHz</div><div class="rf-name-line">${info.name}</div>`;
    } else {
      rfB.textContent = 'RF Link';
    }
    rfB.addEventListener('click', (e) => { 
      e.stopPropagation(); 
      const page = Store.getPages().find(p => p.id === Store.getCurrentPageId());
      PopupManager.openRFPicker(e, row, evt, rfB, {
        zone: page?.rfZone,
        channels: getAllRFChannels(page?.rfZone),
        onSelect: (ch, r, ev, b) => {
          r.rfChannelId = ch.id; 
          const displayFreq = ch.freq.replace(/\s*mhz/gi,'');
          b.innerHTML = `<div class="rf-freq-line">${displayFreq} MHz</div><div class="rf-name-line">${ch.name}</div>`;
          b.classList.remove('unlinked');
          callbacks.saveAssignments(); 
          ConflictManager.checkConflicts();
        }
      }); 
    });

    const del = document.createElement('button');
    del.className = 'assignment-row-del btn-row-del';
    del.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
    del.addEventListener('click', () => { 
      block.rows = block.rows.filter(r => r.id !== row.id); 
      callbacks.saveAssignments(); 
      callbacks.renderPageCanvas(); 
    });

    rowEl.append(pIn, dIn, rfB, del, conflictInd);
    return rowEl;
  },

  /**
   * Segmented rendering for blocks within an event.
   */
  renderBlocks(body, evt, buildBlockElement) {
    BlockInteractions.initEventBody(body, evt);

    let currentSegment = null;
    let hideUntilNextHeader = false;
    const blocks = evt.blocks || [];
    
    body.innerHTML = '';
    
    blocks.forEach(block => {
      const isHeader = (block.type === 'header');
      
      if (isHeader) {
        hideUntilNextHeader = !!block.collapsed;
        currentSegment = null;
        const el = buildBlockElement(block, evt);
        if (block.collapsed) el.classList.add('collapsed');
        body.appendChild(el);
        return;
      }

      if (hideUntilNextHeader) return;

      const isFull = (block.span === 2);
      
      if (isFull) {
        currentSegment = null;
        const el = buildBlockElement(block, evt);
        if (block.collapsed) el.classList.add('collapsed');
        body.appendChild(el);
      } else {
        const useDual = (evt.span === 2);
        
        if (!currentSegment) {
          currentSegment = document.createElement('div');
          currentSegment.className = 'block-segment' + (useDual ? ' dual-columns' : '');
          
          const leftCol = document.createElement('div'); 
          leftCol.className = 'column column-left';
          
          const rightCol = document.createElement('div'); 
          rightCol.className = 'column column-right';
          if (!useDual) rightCol.style.display = 'none';
          
          currentSegment.append(leftCol, rightCol);
          body.appendChild(currentSegment);
          
          [leftCol, rightCol].forEach(col => {
            col.addEventListener('dragover', (e) => {
              const side = col.classList.contains('column-left') ? 'left' : 'right';
              BlockInteractions.handleDragOverSegment(e, col, evt, side);
            });
          });
        }
        
        const el = buildBlockElement(block, evt);
        if (block.collapsed) el.classList.add('collapsed');
        
        const side = block.side || 'left';
        if (side === 'right') {
          currentSegment.querySelector('.column-right').appendChild(el);
        } else {
          currentSegment.querySelector('.column-left').appendChild(el);
        }
      }
    });
  }
};
