import { app, Notification, shell } from 'electron';
import axios from 'axios';

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

export async function checkForUpdates() {
  let data = null;

  try {
    const res = await axios.get('https://versions.archosoftware.com/v1/amfl', {
      timeout: 5000,
    });

    if (res.status === 200 && res.data?.version) {
      console.log('[Updater] Primary success');
      data = res.data;
    } else {
      throw new Error('Invalid primary response');
    }
  } catch (err: any) {
    console.warn('[Updater] Primary failed:', err?.message || err);

    try {
      const fallbackRes = await axios.get('https://amfl-versions.vercel.app/v1/amfl', {
        timeout: 5000,
      });

      if (fallbackRes.status === 200 && fallbackRes.data?.version) {
        console.log('[Updater] Fallback success');
        data = fallbackRes.data;
      } else {
        throw new Error('Invalid fallback response');
      }
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
        if (data.link) shell.openExternal(data.link);
      });

      notification.show();
    } else {
      console.log('[Updater] Up to date');
    }
  } catch (err) {
    console.warn('[Updater] Processing error:', err);
  }
}
