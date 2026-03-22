const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const windowStateKeeper = require('electron-window-state')

// Force Chromium overlay scrollbars: bars float over content, zero layout cost
app.commandLine.appendSwitch('enable-features', 'OverlayScrollbar')

function createWindow () {
  // Load the previous state with default window size
  const mainWindowState = windowStateKeeper({
    defaultWidth: 1200,
    defaultHeight: 800
  });

  const win = new BrowserWindow({
    x: mainWindowState.x,
    y: mainWindowState.y,
    width: mainWindowState.width,
    height: mainWindowState.height,
    minWidth: 1000,
    minHeight: 600,
    title: 'RF Coordination Viewer',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, 'preload.cjs')
    }
  })

  // Let us register listeners on the window, so we can update the state
  // automatically (the listeners will be removed when the window is closed)
  // and restore the maximized state, if it was maximized before closing
  mainWindowState.manage(win);
  win.webContents.openDevTools();

  // Remove default menu for cleaner look
  Menu.setApplicationMenu(null)

  // Load the Vite build directory or Dev Server
  if (app.isPackaged) {
    win.loadFile(path.join(__dirname, 'dist', 'index.html'))
  } else {
    win.loadURL('http://localhost:5173')
  }
}

app.whenReady().then(() => {
  // ─── Persistent Templates ────────────────────────────────────────────────────
  const templatesPath = path.join(app.getPath('userData'), 'templates.json');

  const readTemplates = () => {
    try {
      if (fs.existsSync(templatesPath)) {
        return JSON.parse(fs.readFileSync(templatesPath, 'utf8'));
      }
    } catch (e) { console.error('Failed to read templates:', e); }
    return [];
  };

  const writeTemplates = (templates) => {
    try {
      fs.writeFileSync(templatesPath, JSON.stringify(templates, null, 2), 'utf8');
    } catch (e) { console.error('Failed to write templates:', e); }
  };

  ipcMain.handle('get-templates', () => {
    return readTemplates();
  });

  ipcMain.handle('save-template', (event, template) => {
    const templates = readTemplates();
    const newTemplate = { ...template, id: template.id || `tpl_${Date.now()}` };
    const existingIdx = templates.findIndex(t => t.id === newTemplate.id);
    if (existingIdx !== -1) {
      templates[existingIdx] = newTemplate; // overwrite if updating
    } else {
      templates.push(newTemplate);
    }
    writeTemplates(templates);
    return newTemplate;
  });

  ipcMain.handle('delete-template', (event, id) => {
    const templates = readTemplates().filter(t => t.id !== id);
    writeTemplates(templates);
    return { success: true };
  });

  ipcMain.handle('reorder-templates', (event, newOrderedTemplates) => {
    writeTemplates(newOrderedTemplates);
    return { success: true };
  });

  // ─── PDF Export ──────────────────────────────────────────────────────────────
let currentPrintDate = '';
  ipcMain.handle('set-print-date', (e, dateStr) => {
    currentPrintDate = dateStr;
  });

  ipcMain.handle('export-pdf', async (event, options = {}) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Export Report as PDF',
      defaultPath: options.defaultFilename || 'RF_Coordination_Report.pdf',
      filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
    });

    if (canceled || !filePath) return { success: false, canceled: true };

    try {
      const pdfBuffer = await win.webContents.printToPDF({
        printBackground: true,
        marginsType: 0,
        pageSize: 'A4',
        landscape: false,
        displayHeaderFooter: true,
        headerTemplate: '<div></div>',
        footerTemplate: `<div style="font-size: 8px; font-family: sans-serif; width: 100%; color: #555; margin-bottom: 5mm; position: relative; border-top: 1px solid #eee; padding-top: 5px;"><span style="position: absolute; left: 10mm;">${currentPrintDate}</span><span style="position: absolute; right: 10mm;"><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`
      });
      fs.writeFileSync(filePath, pdfBuffer);
      return { success: true };
    } catch (error) {
      console.error('Failed to generate PDF:', error);
      return { success: false, error: error.message };
    }
  });
  
  ipcMain.handle('preview-pdf', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    
    try {
      const pdfBuffer = await win.webContents.printToPDF({
        printBackground: true,
        marginsType: 0,
        pageSize: 'A4',
        landscape: false,
        displayHeaderFooter: true,
        headerTemplate: '<div></div>',
        footerTemplate: `<div style="font-size: 8px; font-family: sans-serif; width: 100%; color: #555; margin-bottom: 5mm; position: relative; border-top: 1px solid #eee; padding-top: 5px;"><span style="position: absolute; left: 10mm;">${currentPrintDate}</span><span style="position: absolute; right: 10mm;"><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`
      });
      
      return pdfBuffer.toString('base64');
    } catch (error) {
      console.error('Preview PDF failed:', error);
      return null;
    }
  });
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
