import { app, BrowserWindow, components, session, Tray, Menu, nativeImage, Notification, shell } from 'electron';
import { initDiscordRPC, setActivity, setIdleActivity, clearActivity, destroyRPC } from './discord';
import { checkForUpdates } from './updateChecker';
import * as path from 'path';

let tray: Tray | null = null;

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

let pollInterval: NodeJS.Timeout | null = null;
let lastSong: string | null = null;
let songStartTime: number = Date.now();

function startTrackPolling(mainWindow: BrowserWindow) {
  if (pollInterval) clearInterval(pollInterval);

  setIdleActivity();

  pollInterval = setInterval(async () => {
    if (mainWindow.isDestroyed()) {
      clearInterval(pollInterval!);
      pollInterval = null;
      return;
    }

    try {
      // yet another hacky way to get the current track xD.
      // is there any other way?
      const track = await mainWindow.webContents.executeJavaScript(`
        (() => {
          const lcd = document.querySelector('.player-lcd__metadata');
          if (!lcd) return null;

          const song = lcd.querySelector('span.marquee-line__fragment')?.textContent?.trim();
          if (!song || song === '—') return null;

          const metaButtons = [...lcd.querySelectorAll('button.lcd-meta-line__fragment')]
            .map(b => b.textContent?.trim())
            .filter(Boolean);

          const sepIdx = metaButtons.findIndex(t => t === '—');
          const artistParts = sepIdx > 0
            ? metaButtons.slice(0, sepIdx)
            : metaButtons.slice(0, 1);
          const album = sepIdx > 0 ? (metaButtons[sepIdx + 1] ?? '') : '';
          const artist = artistParts.join(', ');

          const paused = !!document.querySelector('button[aria-label="Play"]');
          const url = window.location.href;

          return { song, artist, album, paused, url };
        })()
      `);

      console.log('[Poll] track data:', track);

      if (track && !track.paused) {
        if (track.song !== lastSong) {
          lastSong = track.song;
          songStartTime = Date.now();
          setActivity(track.song, track.artist, track.album, songStartTime, track.url);
        }
      } else {
        if (lastSong !== null) {
          lastSong = null;
          setIdleActivity();
        }
      }
    } catch (err) {
      console.warn('[Poll] error:', err);
    }
  }, 5_000);
}

function createTray(mainWindow: BrowserWindow) {
  const iconPath = path.join(app.getAppPath(), 'assets', 'icon_tray.png');
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });

  tray = new Tray(icon);
  tray.setToolTip('Apple Music');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show',
      click: () => {
        mainWindow.show();
        mainWindow.focus();
      },
    },
    {
      label: 'Hide',
      click: () => mainWindow.hide(),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        (app as any).isQuitting = true;
        destroyRPC();
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

const createWindow = (splash: BrowserWindow): BrowserWindow => {
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

  mainWindow.webContents.setBackgroundThrottling(false);
  mainWindow.webContents.setFrameRate(1);

  mainWindow.once("ready-to-show", () => {
    splash?.close();
    mainWindow.show();
    startTrackPolling(mainWindow);
    createTray(mainWindow);
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
    const clean = title.replace(/\s*-\s*Web Player$/i, '').trim();
    mainWindow.setTitle(clean || 'Music');
  });

  mainWindow.on('close', (event) => {
    if (!(app as any).isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
    lastSong = null;
    clearActivity();
    tray?.destroy();
    tray = null;
  });

  return mainWindow;
};

function setupPermissions(): void {
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      callback(ALLOWED_PERMISSIONS.has(permission));
    }
  );

  session.defaultSession.setPermissionCheckHandler(
    (_webContents, permission) => ALLOWED_PERMISSIONS.has(permission)
  );
}

(app as any).isQuitting = false;

app.whenReady().then(async () => {
  await components.whenReady();
  console.log('[AMFL] Widevine components status:', components.status());

  await initDiscordRPC();

  setupPermissions();

  checkForUpdates();
  
  const splash = createSplash();
  createWindow(splash);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const splash = createSplash();
      createWindow(splash);
    }
  });
});

app.on('before-quit', () => {
  (app as any).isQuitting = true;
});

app.on('will-quit', () => {
  destroyRPC();
});

// app.on("window-all-closed", () => {
//   if (process.platform !== "darwin") app.quit();
// });
