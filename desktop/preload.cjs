const {contextBridge, ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('amigos', {
  action: (name, payload) => ipcRenderer.invoke('action', name, payload),
  onState: callback => ipcRenderer.on('state', (_event, state) => callback(state)),
  onNotice: callback => ipcRenderer.on('notice', (_event, notice) => callback(notice))
});
