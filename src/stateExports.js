/**
 * stateExports.js — Shared live state bridge between main.js and assignments.js
 * main.js writes to sharedState properties; assignments.js reads from them.
 * Since both modules share the same object reference, it is always current.
 */

export const sharedState = {
  parsedZones: [],
  rfStates: {},
  rfNames: {},
  rfNotes: {},
  customFreqs: [],
  customFreqData: {},
  activeBackups: {},
  isActive: false, // For other purposes
  isLocked: false,
  isEditMode: false,
  applyEditMode: null, // Will be set by main.js
};

window.sharedState = sharedState;
