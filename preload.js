const { contextBridge, ipcRenderer } = require('electron/renderer');

contextBridge.exposeInMainWorld('electronApi', {
  setResults: (callback) => ipcRenderer.on('set-results', (_event, results) => callback(results)),
  submitForm: (data) => ipcRenderer.send('form-submission-channel', data)
})