const { contextBridge, ipcRenderer } = require('electron/renderer');

contextBridge.exposeInMainWorld('electronApi', {
  sendClickEvent: () => ipcRenderer.send('button-clicked'),
  getCatalogList: () => ipcRenderer.invoke('get-catalog-list'),
  selectConfigFile: () => ipcRenderer.invoke('select-config-file'),
  loadConfigFile: (sourceFilePath) => ipcRenderer.invoke('load-config-file', sourceFilePath)
})


