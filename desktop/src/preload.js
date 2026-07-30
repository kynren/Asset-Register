const { contextBridge, ipcRenderer } = require("electron");

// Exposed only to the local settings.html / connection-error.html pages shipped with the app —
// never to the remote server content loaded in the main window.
contextBridge.exposeInMainWorld("desktopSetup", {
  getServerUrl: () => ipcRenderer.invoke("get-server-url"),
  setServerUrl: (url) => ipcRenderer.invoke("set-server-url", url),
});
