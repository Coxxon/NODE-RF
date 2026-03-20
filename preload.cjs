const { contextBridge, ipcRenderer, webUtils } = require('electron');
const fs = require('fs');

contextBridge.exposeInMainWorld('electronFS', {
  /**
   * Request an IPC invocation (used for PDF export).
   */
  invoke: (channel, ...args) => {
    return ipcRenderer.invoke(channel, ...args);
  },

  /**
   * Get the native absolute path for a File object (Electron v32+).
   * Works with contextIsolation enabled.
   */
  getPathForFile: (file) => {
    return webUtils.getPathForFile(file);
  },

  /**
   * Read file content synchronously (Read-Only).
   */
  readFile: (filePath) => {
    return fs.readFileSync(filePath, 'utf8');
  },

  /**
   * Check if file exists.
   */
  fileExists: (filePath) => {
    return fs.existsSync(filePath);
  }
});

/**
 * Template API — persistent storage in userData/templates.json.
 * Survives app updates, reinstalls, and reboots.
 */
contextBridge.exposeInMainWorld('templateAPI', {
  /** Returns the full list of saved templates. */
  getTemplates: () => ipcRenderer.invoke('get-templates'),

  /** Saves (or updates) a template. Returns the saved template with its ID. */
  saveTemplate: (template) => ipcRenderer.invoke('save-template', template),

  /** Deletes a template by ID. */
  deleteTemplate: (id) => ipcRenderer.invoke('delete-template', id),

  /** Reorders templates. */
  reorderTemplates: (newArray) => ipcRenderer.invoke('reorder-templates', newArray)
});
