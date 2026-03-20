/**
 * BlockStyles.js — Centralized UI Tokens for Internal Blocks
 */

export const BlockStyles = {
  // Container Styles
  container: `
    position: relative;
    background: rgba(255, 255, 255, 0.02);
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.05);
    margin-bottom: 6px;
    transition: all 0.2s ease;
    overflow: hidden;
  `,
  
  // Header Styles
  header: `
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 2px 8px;
    background: rgba(255, 255, 255, 0.015);
    border-bottom: 1px solid rgba(255, 255, 255, 0.03);
    min-height: 28px;
  `,

  // Drag Handle
  dragHandle: `
    cursor: grab;
    color: var(--text-muted);
    width: 60%;
    height: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    position: absolute;
    top: -1px;
    left: 20%;
    z-index: 10;
  `,

  // Delete Button
  deleteBtn: `
    cursor: pointer;
    color: var(--text-muted);
    padding: 2px;
    border-radius: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
    background: transparent;
    border: none;
  `,

  // Body Padding
  body: `
    padding: 8px 10px;
  `,

  // Block Labels (for header)
  label: `
    font-size: 0.7rem;
    font-weight: 800;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    flex-grow: 1;
    pointer-events: none;
    line-height: 1;
  `
};
