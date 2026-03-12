import type { WsMessage } from '@wttd/shared';

const WS_URL = import.meta.env.VITE_WS_API_URL ?? 'ws://localhost:3001';

type MessageHandler = (msg: WsMessage) => void;

export class GameSocket {
  private ws: WebSocket | null = null;
  private roomCode: string;
  private playerId: string;
  private handlers: MessageHandler[] = [];
  private reconnectDelay = 1000;
  private destroyed = false;

  constructor(roomCode: string, playerId: string) {
    this.roomCode = roomCode;
    this.playerId = playerId;
    this.connect();
  }

  private connect() {
    const spectator = false;
    const url = `${WS_URL}?roomCode=${this.roomCode}&playerId=${this.playerId}&spectator=${spectator}`;
    this.ws = new WebSocket(url);

    this.ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as WsMessage;
        this.handlers.forEach(h => h(msg));
      } catch {}
    };

    this.ws.onclose = () => {
      if (!this.destroyed) {
        setTimeout(() => this.connect(), this.reconnectDelay);
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, 10_000);
      }
    };

    this.ws.onopen = () => {
      this.reconnectDelay = 1000;
    };
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.push(handler);
    return () => { this.handlers = this.handlers.filter(h => h !== handler); };
  }

  destroy() {
    this.destroyed = true;
    this.ws?.close();
  }
}
