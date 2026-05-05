import { app, BrowserWindow, components, session } from 'electron';
import * as path from 'path';

function createSplash() {
  const splash = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    backgroundColor: "#000000",
  });

  splash.loadFile(path.join(app.getAppPath(), "src", "splash.html"));
  return splash;
}

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/124.0.0.0 Safari/537.36';

const ALLOWED_PERMISSIONS = new Set([
  'media',
  'mediaKeySystem',
  'notifications',
  'fullscreen',
]);

const createWindow = (splash: BrowserWindow) => {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 940,
    minHeight: 600,
    show: false,
    title: "Music",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      plugins: true,
      partition: "persist:music",
    },
  });

  mainWindow.webContents.setUserAgent(USER_AGENT);
  mainWindow.loadURL("https://music.apple.com/");

  mainWindow.once("ready-to-show", () => {
    splash?.close();
    mainWindow?.show();
  });

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.insertCSS(`
      .svelte-1r74jcm {
        display: none !important;
      }
    `);
  });

  mainWindow.webContents.on('page-title-updated', (event, title) => {
    event.preventDefault();

    const clean = title
     .replace(/\s*-\s*Web Player$/i, '')
      .trim();

   mainWindow.setTitle(clean || 'Music');
  });
};

function setupPermissions(): void {
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      callback(ALLOWED_PERMISSIONS.has(permission));
    }
  );

  // required for DRM (widevine)
  session.defaultSession.setPermissionCheckHandler(
    (_webContents, permission) => {
      return ALLOWED_PERMISSIONS.has(permission);
    }
  );
}

app.whenReady().then(async () => {

  await components.whenReady();
  console.log('[AMFL] Widevine components status:', components.status());

  const splash = createSplash();
  createWindow(splash);

  setupPermissions();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const splash = createSplash();
      createWindow(splash);
    }
  });
});

//app.on("window-all-closed", () => {
//  if (process.platform !== "darwin") app.quit();
//});
