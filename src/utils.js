/**
 * utils.js - Shared utility functions
 */

export function handleVerticalNavigation(e, selector) {
  if (e.key === 'Tab') {
    const inputs = Array.from(document.querySelectorAll(selector))
      .filter(i => !i.disabled && i.offsetParent !== null);
    
    if (inputs.length <= 1) return;
    
    const index = inputs.indexOf(e.target);
    if (index === -1) return;
    
    e.preventDefault();
    const nextIndex = e.shiftKey ? 
      (index - 1 + inputs.length) % inputs.length : 
      (index + 1) % inputs.length;
    
    const nextInput = inputs[nextIndex];
    if (nextInput) {
      nextInput.focus();
      if (nextInput.select) nextInput.select();
    }
  }
}

export function generateUID() {
  return Math.random().toString(36).slice(2, 10);
}
