import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  windowMinimize: () => ipcRenderer.send('window:minimize'),
  windowClose: () => ipcRenderer.send('window:close'),
});

export {};
