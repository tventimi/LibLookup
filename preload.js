const { contextBridge, ipcRenderer } = require('electron/renderer');

contextBridge.exposeInMainWorld('electronApi', {
  sendClickEvent: () => ipcRenderer.send('button-clicked')
})


