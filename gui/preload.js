const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    sendMessage: (text) => ipcRenderer.send('message-from-gui', text),
    sendAction: (action) => ipcRenderer.send('gui-action', action),
    onMessage: (callback) => ipcRenderer.on('message-to-gui', (event, data) => callback(data)),
    onStatusUpdate: (callback) => ipcRenderer.on('status-update', (event, data) => callback(data)),
    onSessionUpdate: (callback) => ipcRenderer.on('session-update', (event, data) => callback(data)),
    onTilesUpdate: (callback) => ipcRenderer.on('tiles-update', (event, data) => callback(data)),
    onLocaleUpdate: (callback) => ipcRenderer.on('locale-update', (event, data) => callback(data))
});
