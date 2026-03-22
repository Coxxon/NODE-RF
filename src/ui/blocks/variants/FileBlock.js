/**
 * FileBlock.js - Implements local file attachment, preview, and renaming.
 */
export function buildFileBlockBody(block, evt, callbacks) {
  const container = document.createElement('div');
  container.className = 'file-block-body';
  
  const renderList = () => {
    container.innerHTML = '';
    const items = block.items || [];
    
    if (items.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'file-block-empty';
      empty.style.cssText = 'padding:16px; text-align:center; color:var(--text-muted); font-size:0.75rem; border:1px dashed rgba(255,255,255,0.05); border-radius:8px;';
      empty.innerHTML = `No files attached. Use the <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin:0 2px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> button in the header to import.`;
      container.appendChild(empty);
      return;
    }

    items.forEach((item, index) => {
      const row = document.createElement('div');
      row.className = 'file-row';
      
      const line = document.createElement('div');
      line.className = 'file-line';

      // 1. Expand Toggle (Extreme LEFT) — visible for both images AND PDFs
      const expandBtn = document.createElement('button');
      expandBtn.className = 'file-expand-btn';
      const updateExpandIcon = () => {
        expandBtn.innerHTML = item.expanded 
           ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="m18 15-6-6-6 6"/></svg>`
           : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="m6 9 6 6 6-6"/></svg>`;
      };
      updateExpandIcon();
      expandBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        item.expanded = !item.expanded;
        renderList();
        callbacks.onSave();
      });

      // 2. Icon (PDF or IMG)
      const icon = document.createElement('div');
      icon.style.cssText = 'flex-shrink:0; display:flex; align-items:center; justify-content:center; color:var(--primary);';
      if (item.type === 'pdf') {
        icon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>`;
      } else {
        icon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>`;
      }

      // 3. Name (Double-click to rename)
      const name = document.createElement('span');
      name.className = 'file-name-link';
      name.textContent = item.displayName || item.name || '';
      
      const path = item.filePath || item.path || '';
      const isBlob = path.startsWith('blob:');
      name.title = isBlob ? 'Temporary Session URL (Web Fallback)' : `Path: ${path}`;

      const startRename = () => {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'file-rename-input';
        input.value = name.textContent;
        
        let done = false; // Guard: prevent finishRename from running twice
        const finishRename = () => {
          if (done) return;
          done = true;
          const val = input.value.trim();
          if (val) {
            item.displayName = val;
            name.textContent = val;
            callbacks.onSave();
          }
          // Only replaceWith if input still has a parent (not already detached)
          if (input.parentNode) input.replaceWith(name);
        };

        input.addEventListener('blur', finishRename);
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            finishRename();
          }
          if (e.key === 'Escape') {
            done = true; // Prevent blur from saving
            if (input.parentNode) input.replaceWith(name);
          }
        });

        name.replaceWith(input);
        input.focus();
        input.select();
      };

      name.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        startRename();
      });

      // 4. Action Buttons (OPEN, UP, DOWN, DEL - visible via CSS :hover)
      const actions = document.createElement('div');
      actions.className = 'file-row-actions';
      
      const btnStyle = 'background:none; border:none; padding:4px; cursor:pointer; color:var(--text-muted); border-radius:4px;';
      
      const openBtn = document.createElement('button');
      openBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>`;
      openBtn.style.cssText = btnStyle;
      openBtn.title = 'Open File';
      openBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const fullPath = isBlob ? path : 'file://' + path;
        window.open(fullPath);
      });

      const up = document.createElement('button');
      up.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="m18 15-6-6-6 6"/></svg>`;
      up.style.cssText = btnStyle;
      up.title = 'Move Up';
      up.addEventListener('click', (e) => {
        e.stopPropagation();
        if (index > 0) {
          [items[index], items[index - 1]] = [items[index - 1], items[index]];
          callbacks.onSave();
          renderList();
        }
      });

      const down = document.createElement('button');
      down.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="m6 9 6 6 6-6"/></svg>`;
      down.style.cssText = btnStyle;
      down.title = 'Move Down';
      down.addEventListener('click', (e) => {
        e.stopPropagation();
        if (index < items.length - 1) {
          [items[index], items[index + 1]] = [items[index + 1], items[index]];
          callbacks.onSave();
          renderList();
        }
      });

      const del = document.createElement('button');
      del.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
      del.style.cssText = btnStyle + ' color:#ef4444;';
      del.title = 'Delete';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        block.items = items.filter((_, i) => i !== index);
        callbacks.onSave();
        renderList();
      });

      actions.append(openBtn, up, down, del);
      line.append(expandBtn, icon, name, actions);
      row.append(line);

      // 5. Preview Area — Lazy: DOM only exists when item.expanded === true
      if (item.expanded) {
        const preview = document.createElement('div');
        preview.className = 'file-preview-area';

        if (item.type === 'image') {
          // Zoom state — transient (not persisted to JSON), resets on collapse/expand
          if (item._zoomLevel === undefined) item._zoomLevel = 1;

          // Scrollable wrapper so the image can be panned when zoomed
          const scroller = document.createElement('div');
          scroller.className = 'file-preview-img-scroller';
          scroller.style.cssText = 'overflow: overlay; width:100%; height:100%; display:flex; align-items:center; justify-content:center; cursor:default;';

          const img = document.createElement('img');
          img.className = 'file-preview-img';
          img.src = isBlob ? path : 'file://' + path;
          img.style.cssText = `transform-origin: center center; transform: scale(${item._zoomLevel}); transition: transform 0.05s; display:block; max-width:none;`;

          // CTRL + Wheel → zoom
          scroller.addEventListener('wheel', (e) => {
            if (!e.ctrlKey) return;
            e.preventDefault();
            e.stopPropagation();
            const delta = e.deltaY < 0 ? 0.1 : -0.1;
            item._zoomLevel = Math.min(5, Math.max(0.2, item._zoomLevel + delta));
            img.style.transform = `scale(${item._zoomLevel})`;
            // Update cursor hint
            scroller.style.cursor = item._zoomLevel > 1 ? 'grab' : 'default';
          }, { passive: false });

          // Double-click → reset zoom
          img.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            item._zoomLevel = 1;
            img.style.transform = 'scale(1)';
            scroller.style.cursor = 'default';
          });

          scroller.appendChild(img);
          preview.appendChild(scroller);

        } else if (item.type === 'pdf') {
          // PDF preview via Chromium's native PDF reader.
          // #toolbar=0    → hides Chrome PDF toolbar
          // #navpanes=0   → hides navigation panes (suppresses native scrollbar chrome)
          // #view=FitH    → fits page horizontally for clean integration
          const pdfSrc = (isBlob ? path : 'file://' + path) + '#toolbar=0&navpanes=0&view=FitH';
          const embed = document.createElement('embed');
          embed.src = pdfSrc;
          embed.type = 'application/pdf';
          embed.className = 'file-preview-pdf';
          preview.appendChild(embed);
        }

        row.appendChild(preview);
      }

      container.appendChild(row);
    });
  };

  renderList();
  return container;
}
