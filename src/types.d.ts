import type { ElectronBridge } from './preload';

declare global {
  interface Window {
    electronBridge: ElectronBridge;
  }
}

// not typed in @types/electron by default, so we need to declare it ourselves
declare module 'electron' {
  interface Components {
    whenReady(): Promise<void>;
    status(): Record<string, ComponentStatus>;
  }

  interface ComponentStatus {
    name: string;
    version: string;
  }

  const components: Components;
}
