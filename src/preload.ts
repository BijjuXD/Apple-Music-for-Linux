// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld("api", {
  appName: "Music",
});

export interface ElectronBridge {
  platform: NodeJS.Platform;
  getVersion: () => Promise<string>;
  window: {
    minimize: () => void;
    maximize: () => void;
    close: () => void;
  };
}

const bridge: ElectronBridge = {
  platform: process.platform,

  getVersion: () => ipcRenderer.invoke('app:version'),

  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
  },
};

contextBridge.exposeInMainWorld('electronAPI', {
  updateDiscordRPC: (data: { song: string; artist: string; album: string }) =>
    ipcRenderer.send('discord-rpc-update', data),
  clearDiscordRPC: () => ipcRenderer.send('discord-rpc-clear'),
});

contextBridge.exposeInMainWorld('electronBridge', bridge);
