import { app, Notification, shell } from 'electron';

interface VersionResponse {
  version: string;
  comment?: string;
  link?: string;
}

function isNewerVersion(current: string, remote: string): boolean {
  const c = current.split('.').map(Number);
  const r = remote.split('.').map(Number);

  for (let i = 0; i < Math.max(c.length, r.length); i++) {
    const cv = c[i] || 0;
    const rv = r[i] || 0;

    if (rv > cv) return true;
    if (rv < cv) return false;
  }

  return false;
}

function isValidResponse(data: any): data is VersionResponse {
  return data && typeof data.version === 'string';
}

async function fetchWithTimeout(url: string, timeout = 5000): Promise<VersionResponse> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, { signal: controller.signal });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();

    if (!isValidResponse(data)) {
      throw new Error('Invalid response shape');
    }

    return data;
  } finally {
    clearTimeout(id);
  }
}

export async function checkForUpdates() {
  let data: VersionResponse | null = null;

  try {
    data = await fetchWithTimeout('https://versions.archosoftware.com/v1/amfl');
    console.log('[Updater] Primary success');
  } catch (err: any) {
    console.warn('[Updater] Primary failed:', err?.message || err);

    try {
      data = await fetchWithTimeout('https://amfl-versions.vercel.app/v1/amfl');
      console.log('[Updater] Fallback success');
    } catch (fallbackErr: any) {
      console.warn('[Updater] Fallback failed:', fallbackErr?.message || fallbackErr);
      return;
    }
  }

  try {
    const currentVersion = app.getVersion();

    console.log('[Updater] Current:', currentVersion);
    console.log('[Updater] Remote:', data.version);

    if (isNewerVersion(currentVersion, data.version)) {
      console.log('[Updater] Update available');

      const notification = new Notification({
        title: 'Update Available',
        body: `Version ${data.version} is available.\n${data.comment || ''}`,
      });

      notification.on('click', () => {
        if (data.link) {
          shell.openExternal(data.link);
        }
      });

      notification.show();
    } else {
      console.log('[Updater] Up to date');
    }
  } catch (err) {
    console.warn('[Updater] Processing error:', err);
  }
}
