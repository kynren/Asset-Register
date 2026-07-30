const { app, BrowserWindow, Menu, shell, ipcMain, dialog } = require("electron");
const path = require("path");
const Store = require("electron-store");

const store = new Store({
  defaults: {
    serverUrl: null,
    windowBounds: { width: 1440, height: 900 },
  },
});

const ICON_PATH = path.join(__dirname, "..", "assets", "icon.png");

let mainWindow = null;
let settingsWindow = null;
let currentServerUrl = null;
let currentTargetOrigin = null;

function isValidServerUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeServerUrl(value) {
  return value.trim().replace(/\/+$/, "");
}

// Read by the window-open/navigation guards below. Kept at module scope (rather than captured
// in a per-window closure) so that changing the server URL later — via reconnect() — updates
// what those listeners check without having to tear down and recreate the BrowserWindow.
function setCurrentServerUrl(serverUrl) {
  currentServerUrl = serverUrl;
  currentTargetOrigin = new URL(serverUrl).origin;
}

// The desktop shell is intentionally "thin": it does not embed the server or database, and it
// does not modify how the web app talks to its API (still relative "/api" calls, same-origin).
// This window just points a real Chromium session at your existing hosted deployment, so every
// feature works exactly as it does in a browser — nothing here re-implements app logic.
function createMainWindow(serverUrl) {
  setCurrentServerUrl(serverUrl);
  const bounds = store.get("windowBounds");

  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: 960,
    minHeight: 600,
    icon: ICON_PATH,
    title: "Kynren Asset Register",
    backgroundColor: "#0b1220",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
    show: false,
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());

  const persistBounds = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMaximized() || mainWindow.isMinimized() || mainWindow.isFullScreen()) return;
    store.set("windowBounds", mainWindow.getBounds());
  };
  mainWindow.on("resize", persistBounds);
  mainWindow.on("move", persistBounds);

  // Links to a different origin (docs, GitHub, mailto:, etc.) open in the user's real browser
  // instead of spawning an uncontrolled Electron window. Reads currentTargetOrigin (not a
  // closure-captured value) so it stays correct after reconnect() points the window elsewhere.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      if (new URL(url).origin === currentTargetOrigin) {
        return { action: "allow" };
      }
    } catch {
      // fall through to external
    }
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    // The connection-error page's "Change Server URL" link — intercepted here rather than via a
    // preload, so the main window (which loads untrusted remote content) never gets one attached.
    if (url.startsWith("kynren-desktop://change-server")) {
      event.preventDefault();
      createSettingsWindow({ allowClose: true });
      return;
    }
    try {
      if (new URL(url).origin !== currentTargetOrigin) {
        event.preventDefault();
        shell.openExternal(url);
      }
    } catch {
      event.preventDefault();
    }
  });

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) return; // -3 = ERR_ABORTED, usually a cancelled sub-request
    mainWindow.loadFile(path.join(__dirname, "connection-error.html"), {
      query: { url: currentServerUrl, error: errorDescription || String(errorCode) },
    });
  });

  mainWindow.loadURL(serverUrl);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  return mainWindow;
}

function createSettingsWindow({ allowClose = true } = {}) {
  if (settingsWindow) {
    settingsWindow.focus();
    return settingsWindow;
  }

  settingsWindow = new BrowserWindow({
    width: 480,
    height: 420,
    resizable: false,
    minimizable: false,
    maximizable: false,
    icon: ICON_PATH,
    title: "Connect to Kynren Asset Register",
    backgroundColor: "#0b1220",
    parent: allowClose && mainWindow ? mainWindow : undefined,
    modal: allowClose && Boolean(mainWindow),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  if (!allowClose) {
    settingsWindow.on("close", (event) => {
      if (!store.get("serverUrl")) {
        app.quit();
      }
    });
  }

  settingsWindow.setMenuBarVisibility(false);
  settingsWindow.loadFile(path.join(__dirname, "settings.html"));
  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });

  return settingsWindow;
}

function reconnect(serverUrl) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    setCurrentServerUrl(serverUrl);
    mainWindow.loadURL(serverUrl);
    mainWindow.focus();
  } else {
    createMainWindow(serverUrl);
  }
}

function buildMenu() {
  const template = [
    ...(process.platform === "darwin"
      ? [{ role: "appMenu" }]
      : []),
    {
      label: "File",
      submenu: [
        {
          label: "Change Server URL...",
          click: () => createSettingsWindow({ allowClose: true }),
        },
        { type: "separator" },
        process.platform === "darwin" ? { role: "close" } : { role: "quit" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
        ...(!app.isPackaged ? [{ type: "separator" }, { role: "toggleDevTools" }] : []),
      ],
    },
    { role: "windowMenu" },
    {
      label: "Help",
      submenu: [
        {
          label: "About Kynren Asset Register",
          click: () => {
            dialog.showMessageBox(mainWindow ?? undefined, {
              type: "info",
              title: "About",
              message: "Kynren Asset Register",
              detail: `Desktop shell v${app.getVersion()}\nConnected to: ${store.get("serverUrl") ?? "not configured"}`,
            });
          },
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

ipcMain.handle("get-server-url", () => store.get("serverUrl"));

ipcMain.handle("set-server-url", (_event, rawUrl) => {
  const url = normalizeServerUrl(rawUrl);
  if (!isValidServerUrl(url)) {
    return { ok: false, error: "Enter a valid http:// or https:// URL." };
  }
  store.set("serverUrl", url);
  reconnect(url);
  if (settingsWindow) settingsWindow.close();
  return { ok: true };
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    buildMenu();

    const savedUrl = store.get("serverUrl");
    if (savedUrl && isValidServerUrl(savedUrl)) {
      createMainWindow(savedUrl);
    } else {
      createSettingsWindow({ allowClose: false });
    }

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        const url = store.get("serverUrl");
        if (url) createMainWindow(url);
        else createSettingsWindow({ allowClose: false });
      }
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
