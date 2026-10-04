import { Client } from "pg";
import { BOARD_CHANNEL } from "./notify";

type Listener = (payload: string) => void;

/**
 * One dedicated Postgres connection per process LISTENs on the board channel
 * and fans notifications out to every connected SSE stream.
 */
class BoardEvents {
  private listeners = new Set<Listener>();
  private client: Client | null = null;
  private connecting = false;

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    void this.ensureConnected();
    return () => {
      this.listeners.delete(listener);
    };
  }

  private async ensureConnected() {
    if (this.client || this.connecting) return;
    this.connecting = true;
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    try {
      client.on("notification", (msg) => {
        if (msg.payload) this.listeners.forEach((l) => l(msg.payload!));
      });
      client.on("error", () => this.reset(client));
      client.on("end", () => this.reset(client));
      await client.connect();
      await client.query(`LISTEN ${BOARD_CHANNEL}`);
      this.client = client;
    } catch {
      this.reset(client);
    } finally {
      this.connecting = false;
    }
  }

  private reset(client: Client) {
    if (this.client === client) this.client = null;
    client.removeAllListeners();
    client.on("error", () => {});
    void client.end().catch(() => {});
    // Retry while somebody is still listening.
    if (this.listeners.size > 0) setTimeout(() => void this.ensureConnected(), 2000);
  }
}

const globalForEvents = globalThis as unknown as { boardEvents?: BoardEvents };
export const boardEvents = (globalForEvents.boardEvents ??= new BoardEvents());
