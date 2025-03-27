import { app, BrowserWindow, session } from "electron";

import { addFlash } from "./utils/flash";
import { getAssetPath } from "./utils/getAssetPath";
import { NetworkListener } from "./utils/networkListener";
import { existsSync, mkdirSync, writeFile } from "fs";
import { dirname, join, resolve } from "path";

process.env["ELECTRON_DISABLE_SECURITY_WARNINGS"] = "false";

let networkListener: NetworkListener | null = null;
let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;
const swfPath = "https://aetheria.asia/game/browser";
const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.93 Safari/537.36 Edg/90.0.818.51";

function saveBufferToFile(buffer: Buffer, filepath: string) {
  const downloadsPath = app.getPath('downloads'); // Get the Downloads folder path
  const filePath = resolve(join(downloadsPath, new URL(swfPath).hostname, filepath));
  if (!existsSync(dirname(filePath))) mkdirSync(dirname(filePath), { recursive: true });

  writeFile(filePath, buffer, (err) => {
      if (err) {
          console.error('Failed to save file:', err);
      } else {
          console.log('File saved to:', filePath);
      }
  });
}


const createSplashWindow = () => {
  splashWindow = new BrowserWindow({
    width: 720,
    height: 306,
    show: false,
    frame: false,
    center: true,
    alwaysOnTop: true,
    transparent: true,
    skipTaskbar: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    }
  });

  splashWindow.loadFile(getAssetPath("splash.html"));
  return new Promise<void>((resolve) => {
    splashWindow?.once('ready-to-show', () => {
      splashWindow?.show();
      splashWindow?.webContents.once('did-finish-load', resolve);
    });
  });
};

const createMainWindow = async () => {
  mainWindow = new BrowserWindow({
    show: false,
    center: true,
    width: 960,
    height: 550,
    webPreferences: {
      contextIsolation: true,
      webviewTag: false,
      plugins: true,
    },
  });

  mainWindow.setMenu(null);
  mainWindow.setAspectRatio(960 / 550, { width: 960, height: 550 });
  mainWindow.webContents.userAgent = userAgent;
  mainWindow.webContents.openDevTools({ mode: "detach" });
  session.defaultSession.webRequest.onBeforeSendHeaders((details, fn) => {
    details.requestHeaders['User-Agent'] = userAgent;
    details.requestHeaders['artixmode'] = 'launcher';
    details.requestHeaders['x-requested-with'] = 'ShockwaveFlash/32.0.0.371';
    fn({ requestHeaders: details.requestHeaders, cancel: false });
  });
  await mainWindow.webContents.session.clearHostResolverCache();

  networkListener = new NetworkListener(mainWindow).start();

  networkListener.on('request', ({ requestId, resource }) => {
    console.log('Request started:', requestId, resource.request.url);
  })
  .on('complete', ({ requestId, resource }) => {
    const filePath = new URL(resource.response.url).searchParams.get("path") ?? new URL(resource.response.url).pathname;
    if (["swf", "mp3"].some((ext) => filePath.endsWith(`.${ext}`))) {
      saveBufferToFile(resource.body, filePath)
    }

    if (resource.request.url.includes("client") && resource.response?.mimeType === "application/x-shockwave-flash") {
    // console.log('Request completed:', requestId, resource);
    // saveBufferToFile(resource.body, "client")

      if (!splashWindow) return;
      splashWindow.webContents.executeJavaScript(`
        document.getElementById('loading').style.display = 'none';
        document.getElementById('starting').style.display = 'block';
      `).then(() => {
        setTimeout(() => {
          splashWindow?.close();
          splashWindow = null;
          mainWindow?.show();
          mainWindow?.focus();
        }, 3_000);
      });
    }
  })
  .on('error', (err) => {
    console.error('Network error:', err);
  });

  mainWindow.webContents.on('did-frame-finish-load', (_, isMainFrame) => {
    if (!isMainFrame) return;

    mainWindow?.webContents.insertCSS(`
      html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }
      embed { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
    `);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  await mainWindow.loadURL(swfPath);
};


function checkBrowserFlashSupport() {
  const win = new BrowserWindow({ show: false });
  return new Promise((resolve) => {
    win.webContents.once('did-finish-load', () => {
      win.webContents.executeJavaScript(`
        navigator.plugins && Array.from(navigator.plugins).some(
          plugin => plugin.name.includes('Flash') || plugin.description.includes('Flash')
        )
      `).then(hasFlash => {
        win.close();
        resolve(hasFlash);
      }).catch(() => {
        win.close();
        resolve(false);
      });
    });
    win.loadURL('about:blank');
  });
}

if (process.platform === "win32") app.commandLine.appendSwitch("force-device-scale-factor", "1");

app
  .on("activate", () => {
    if (mainWindow === null) createMainWindow();
  })
  .on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

addFlash(swfPath);
app
  .whenReady()
  .then(async () => {
    await checkBrowserFlashSupport().then((_) => console.log("Flash support: ", _))
    await createSplashWindow();
    await createMainWindow();
  })
  .catch((error) => console.error("ELECTRON ERROR:", error));

if (process.platform === "win32") process.on("message", (data) => data === "graceful-exit" && app.quit());
else process.on("SIGTERM", () => app.quit());

process.on("unhandledRejection", console.log)
