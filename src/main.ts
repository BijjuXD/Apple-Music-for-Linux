import { app, BrowserWindow } from 'electron';
import path from 'node:path';

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

const createWindow = (splash: BrowserWindow) => {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
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

  mainWindow.loadURL("https://music.apple.com/");

  mainWindow.once("ready-to-show", () => {
    splash?.close();
    mainWindow?.show();
  });
};

app.whenReady().then(() => {

  const splash = createSplash();
  createWindow(splash);

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
