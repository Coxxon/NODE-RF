/**
 * BlockFactory.js — Structural Skeleton for Internal Blocks
 */
import { BlockStyles } from './BlockStyles.js';

export const BlockFactory = {
  createBlock(block, evt, buildContent, callbacks = {}) {
    const isSeparator = (block.type === 'header');
    const el = document.createElement('div');
    el.className = 'data-block' + (block.collapsed ? ' collapsed' : '');
    if (isSeparator) el.classList.add('block-separator');
    
    el.dataset.blockId = block.id;
    el.dataset.type = block.type;
    el.style.cssText = BlockStyles.container;
    el.draggable = false;

    // HEADER
    const header = document.createElement('div');
    header.className = 'data-block-header';
    header.style.cssText = BlockStyles.header;

    // 1. Drag Handle
    const handle = document.createElement('div');
    handle.className = 'block-drag-handle';
    handle.style.cssText = BlockStyles.dragHandle;
    handle.innerHTML = ''; // Replaced dots with CSS line
    
    // 2. Collapse Toggle
    const collapseBtn = document.createElement('button');
    collapseBtn.className = 'block-collapse-btn';
    const updateIcon = () => {
      collapseBtn.innerHTML = block.collapsed 
        ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="m9 18 6-6-6-6"/></svg>`
        : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="m6 9 6 6 6-6"/></svg>`;
    };
    updateIcon();
    collapseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      block.collapsed = !block.collapsed;
      updateIcon();
      el.classList.toggle('collapsed', block.collapsed);
      if (callbacks.onToggleCollapse) callbacks.onToggleCollapse(block);
    });

    header.append(collapseBtn);
    el.appendChild(handle); // Append to block container for absolute positioning

    // 3. Label or Integrated Title
    if (!isSeparator) {
      const label = document.createElement('span');
      label.style.cssText = BlockStyles.label;
      label.textContent = callbacks.label || block.type.replace(/-/g, ' ');
      header.appendChild(label);
    } else {
      // Integrated Title Input for Separators
      try {
        const titleContent = buildContent(block, evt);
        if (titleContent) {
          titleContent.style.flex = '1';
          header.appendChild(titleContent);
        }
      } catch (err) {
        console.error(`[BlockFactory] Failed to build integrated title for separator:`, err);
      }
    }

    // 4. Custom Header Content (Note Toolbar, etc.)
    if (callbacks.buildHeaderExtras) {
      try {
        header.appendChild(callbacks.buildHeaderExtras(block, evt));
      } catch (err) {
        console.error(`[BlockFactory] Failed to build header extras for ${block.type}:`, err);
      }
    }

    // 5. Width Resizer
    if (evt.span === 2 && !isSeparator) {
      const resizer = document.createElement('button');
      resizer.className = 'block-resizer-btn';
      resizer.innerHTML = block.span === 2 
        ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="m11 17-5-5 5-5"/><path d="m18 17-5-5 5-5"/></svg>`
        : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="m6 17 5-5-5-5"/><path d="m13 17 5-5-5-5"/></svg>`;
      resizer.addEventListener('click', (e) => {
        e.stopPropagation();
        block.span = (block.span === 2) ? 1 : 2;
        if (callbacks.onResize) callbacks.onResize();
      });
      header.appendChild(resizer);
    }

    // 6. Delete Button
    const del = document.createElement('button');
    del.className = 'data-block-remove';
    del.style.cssText = BlockStyles.deleteBtn;
    del.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      if (callbacks.onDelete) callbacks.onDelete(block.id);
    });

    header.appendChild(del);
    el.appendChild(header);

    // CONTENT BODY (Skip for separators)
    if (!isSeparator) {
      const body = document.createElement('div');
      body.className = 'block-content-body';
      if (block.collapsed) body.style.display = 'none';

      try {
        const content = buildContent(block, evt);
        if (content) body.appendChild(content);
        el.appendChild(body);
      } catch (err) {
        console.error(`[BlockFactory] Failed to build content for ${block.type}:`, err);
        const errorMsg = document.createElement('div');
        errorMsg.style.padding = '8px';
        errorMsg.style.color = '#ef4444';
        errorMsg.style.fontSize = '0.65rem';
        errorMsg.textContent = 'Rendering Error';
        body.appendChild(errorMsg);
        el.appendChild(body);
      }
    }

    return el;

    return el;
  }
};
