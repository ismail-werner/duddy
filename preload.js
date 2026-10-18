const { contextBridge, ipcRenderer } = require('electron');
const call = (ch) => () => ipcRenderer.invoke(ch);
contextBridge.exposeInMainWorld('api', {
  ask: (text, files, brain) => ipcRenderer.invoke('ask', text, files, brain),
  health: call('health'), disks: call('disks'), procs: call('procs'), clean: call('clean'),
  stats: call('stats'), media: (a) => ipcRenderer.invoke('media', a), terminal: call('terminal'), getLogin: call('login'),
  setLogin: (on) => ipcRenderer.send('set-login', on),
  shape: (w, h) => ipcRenderer.send('shape', w, h),
  hooksStatus: call('hooks-status'), hooksToggle: call('hooks-toggle'),
  decide: (id, d) => ipcRenderer.send('perm-decision', id, d),
  onPerm: (fn) => ipcRenderer.on('perm', (_, p) => fn(p)),
  onPermGone: (fn) => ipcRenderer.on('perm-gone', (_, id) => fn(id)),
  onNote: (fn) => ipcRenderer.on('note', (_, n) => fn(n)),
  quit: () => ipcRenderer.send('quit'),
  onChunk: (fn) => ipcRenderer.on('chunk', (_, t) => fn(t)),
  onCmd: (fn) => ipcRenderer.on('cmd', (_, c) => fn(c)),
});
