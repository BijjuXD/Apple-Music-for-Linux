import * as net from "net";
import * as fs from "fs";
import * as path from "path";
import { EventEmitter } from "events";

const CLIENT_ID = "1501171104264491068";

class DiscordIPC extends EventEmitter {
  private socket: net.Socket | null = null;
  private connected = false;

  private findSocket(): string | null {
    const uid = process.getuid?.() ?? 1000;
    const xdgRuntime = process.env.XDG_RUNTIME_DIR ?? `/run/user/${uid}`;

    const dirs = [
      path.join(xdgRuntime, "app", "com.discordapp.Discord"),
      path.join(xdgRuntime, ".flatpak", "com.discordapp.Discord", "xdg-run"),
      xdgRuntime,
      `/run/user/${uid}`,
      "/tmp",
    ];

    for (const dir of dirs) {
      for (let i = 0; i < 10; i++) {
        const p = path.join(dir, `discord-ipc-${i}`);
        if (fs.existsSync(p)) {
          console.log("[RPC] Found socket:", p);
          return p;
        }
      }
    }
    return null;
  }

  private encode(opcode: number, payload: object): Buffer {
    const json = JSON.stringify(payload);
    const buf = Buffer.alloc(8 + Buffer.byteLength(json));
    buf.writeUInt32LE(opcode, 0);
    buf.writeUInt32LE(Buffer.byteLength(json), 4);
    buf.write(json, 8);
    return buf;
  }

  private decode(buf: Buffer): { opcode: number; payload: any } {
    const opcode = buf.readUInt32LE(0);
    const length = buf.readUInt32LE(4);
    const payload = JSON.parse(buf.slice(8, 8 + length).toString());
    return { opcode, payload };
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socketPath = this.findSocket();
      if (!socketPath) return reject(new Error("Discord socket not found"));

      this.socket = net.createConnection(socketPath);
      let buffer = Buffer.alloc(0);

      this.socket.on("connect", () => {
        console.log("[RPC] Socket connected, sending handshake...");
        this.socket!.write(this.encode(0, { v: 1, client_id: CLIENT_ID }));
      });

      this.socket.on("data", (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk]);

        while (buffer.length >= 8) {
          const length = buffer.readUInt32LE(4);
          if (buffer.length < 8 + length) break;

          const { opcode, payload } = this.decode(buffer);
          buffer = buffer.slice(8 + length);

          console.log(
            "[RPC] Received opcode:",
            opcode,
            "event:",
            payload?.evt,
            "cmd:",
            payload?.cmd
          );

          if (opcode === 1) {
            if (payload?.evt === "READY") {
              this.connected = true;
              console.log("[RPC] Connected as:", payload?.data?.user?.username);
              resolve();
            } else if (payload?.evt === "ERROR") {
              console.warn("[RPC] Error from Discord:", payload?.data);
              reject(new Error(payload?.data?.message ?? "Discord RPC error"));
            }
          }
        }
      });

      this.socket.on("error", (err) => {
        console.warn("[RPC] Socket error:", err.message);
        this.connected = false;
        reject(err);
      });

      this.socket.on("close", () => {
        console.log("[RPC] Socket closed");
        this.connected = false;
      });
      this.socket.on("data", (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk]);

        while (buffer.length >= 8) {
          const length = buffer.readUInt32LE(4);
          if (buffer.length < 8 + length) break;

          const { opcode, payload } = this.decode(buffer);
          buffer = buffer.slice(8 + length);

          // for debug
          // console.log('[RPC] Full payload:', JSON.stringify(payload, null, 2));

          if (opcode === 1) {
            if (payload?.evt === "READY") {
              this.connected = true;
              console.log("[RPC] Connected as:", payload?.data?.user?.username);
              resolve();
            } else if (payload?.evt === "ERROR") {
              console.warn(
                "[RPC] Error from Discord:",
                JSON.stringify(payload?.data)
              );
            }
          }
        }
      });
    });
  }

  setActivity(
    song: string,
    artist: string,
    album: string,
    startTimestamp?: number,
    url?: string
  ): void {
    if (!this.connected || !this.socket) {
      console.warn("[RPC] setActivity called but not connected");
      return;
    }

    console.log("[RPC] Setting activity:", song, "-", artist, "/", album);

    const payload = {
      cmd: "SET_ACTIVITY",
      args: {
        pid: process.pid,
        activity: {
          type: 2,
          details: song,
          state: `by ${artist}`,
          assets: {
            large_image: "music",
            large_text: album || "Apple Music",
          },
          timestamps: {
            start: startTimestamp ?? Date.now(),
          },
          buttons: [
            {
              label: "Listen on Apple Music",
              url: url || "https://music.apple.com",
            },
          ],
          instance: false,
        },
      },
      nonce: Date.now().toString(),
    };

    this.socket.write(this.encode(1, payload));
  }

  setIdleActivity(): void {
    if (!this.connected || !this.socket) return;

    console.log("[RPC] Setting idle activity");

    const payload = {
      cmd: "SET_ACTIVITY",
      args: {
        pid: process.pid,
        activity: {
          type: 2,
          details: "Not Playing...",
          state: "Idling...",
          assets: {
            large_image: "music",
            large_text: "Apple Music",
          },
          buttons: [
            {
              label: "Get Apple Music App",
              url: "https://github.com/BijjuXD/Apple-Music-for-Linux",
            },
          ],
          instance: false,
        },
      },
      nonce: Date.now().toString(),
    };

    this.socket.write(this.encode(1, payload));
  }

  clearActivity(): void {
    if (!this.connected || !this.socket) return;

    this.socket.write(
      this.encode(1, {
        cmd: "SET_ACTIVITY",
        args: { pid: process.pid, activity: null },
        nonce: Date.now().toString(),
      })
    );
  }

  destroy(): void {
    this.clearActivity();
    this.socket?.destroy();
    this.socket = null;
    this.connected = false;
  }
}

let ipc: DiscordIPC | null = null;

export async function initDiscordRPC() {
  ipc = new DiscordIPC();
  try {
    await ipc.connect();
  } catch (err) {
    console.warn("[RPC] Failed to connect:", err);
    ipc = null;
  }
}

export function setActivity(
  song: string,
  artist: string,
  album: string,
  startTimestamp?: number,
  url?: string
) {
  ipc?.setActivity(song, artist, album, startTimestamp, url);
}

export function setIdleActivity() {
  ipc?.setIdleActivity();
}

export function clearActivity() {
  ipc?.clearActivity();
}

export function destroyRPC() {
  ipc?.destroy();
  ipc = null;
}
