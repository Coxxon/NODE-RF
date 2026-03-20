/**
 * HeaderBlock.js — Content Variant
 */

export function buildHeaderBlockBody(block, evt, callbacks = {}) {
  if (block.title === undefined) block.title = '';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'block-field header-title-input';
  input.value = block.title;
  input.placeholder = 'SECTION TITLE...';
  
  input.addEventListener('input', () => { 
    block.title = input.value; 
    if (callbacks.onSave) callbacks.onSave(evt); 
  });
  
  input.addEventListener('keydown', (e) => { 
    if (e.key === 'Enter') input.blur(); 
  });
  
  return input;
}
