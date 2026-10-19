// Peer-to-peer link over WebRTC using PeerJS's free public signaling and TURN servers.
const PREFIX = 'padel-royale-v1-';
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LEN = 5;

let peerLib = null;
function loadPeer() {
  if (window.Peer) return Promise.resolve(window.Peer);
  peerLib ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'vendor/peerjs.min.js';
    s.onload = () => (window.Peer ? resolve(window.Peer) : reject(new Error('Networking failed to load')));
    s.onerror = () => { peerLib = null; reject(new Error('Could not load networking — check your connection')); };
    document.head.appendChild(s);
  });
  return peerLib;
}

function makeCode() {
  const r = crypto.getRandomValues(new Uint32Array(CODE_LEN));
  return Array.from(r, (n) => ALPHABET[n % ALPHABET.length]).join('');
}

export function normalizeCode(s) {
  return [...String(s || '').toUpperCase()].filter((c) => ALPHABET.includes(c)).join('').slice(0, CODE_LEN);
}

function friendly(err) {
  switch (err?.type) {
    case 'peer-unavailable': return new Error('No game found with that code');
    case 'browser-incompatible': return new Error('This browser does not support online play');
    case 'network': case 'server-error': case 'socket-error': case 'socket-closed':
      return new Error('Could not reach the game server — check your connection');
    default: return err instanceof Error ? err : new Error('Connection failed');
  }
}

export class Link {
  constructor() {
    this.peer = null;
    this.conn = null;
    this.closed = false;
    this.pendingJoin = null;
    this.onData = null;
    this.onConnect = null;
    this.onClose = null;
  }

  async host() {
    const Peer = await loadPeer();
    for (let attempt = 0; attempt < 4; attempt++) {
      const code = makeCode();
      try {
        await this.openPeer(Peer, PREFIX + code);
        return code;
      } catch (err) {
        if (err?.type !== 'unavailable-id') throw friendly(err);
      }
    }
    throw new Error('Could not reserve a game code, try again');
  }

  async join(code) {
    const Peer = await loadPeer();
    try {
      await this.openPeer(Peer, null);
    } catch (err) {
      throw friendly(err);
    }
    await new Promise((resolve, reject) => {
      this.pendingJoin = { resolve, reject };
      const conn = this.peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
      conn.on('open', () => {
        if (!this.pendingJoin) return conn.close();
        this.pendingJoin = null;
        this.attach(conn);
        resolve();
      });
      setTimeout(() => this.failJoin(new Error('Could not reach that game — ask your friend for a new code')), 15000);
    });
  }

  failJoin(err) {
    const p = this.pendingJoin;
    if (!p) return;
    this.pendingJoin = null;
    p.reject(err);
  }

  openPeer(Peer, id) {
    return new Promise((resolve, reject) => {
      if (this.closed) return reject(new Error('Closed'));
      const peer = id ? new Peer(id) : new Peer();
      let opened = false;
      peer.on('open', () => {
        opened = true;
        this.peer = peer;
        resolve();
      });
      peer.on('error', (err) => {
        if (!opened) {
          peer.destroy();
          reject(err);
        } else {
          this.failJoin(friendly(err));
        }
      });
      // Losing the signaling server is harmless once connected, but a waiting host needs it.
      peer.on('disconnected', () => { if (!this.closed && !this.conn) peer.reconnect(); });
      peer.on('connection', (conn) => this.accept(conn));
    });
  }

  accept(conn) {
    if (this.conn || this.closed) {
      conn.on('open', () => conn.close());
      return;
    }
    conn.on('open', () => {
      if (this.conn) return conn.close();
      this.attach(conn);
      this.onConnect?.();
    });
  }

  attach(conn) {
    this.conn = conn;
    conn.on('data', (d) => this.onData?.(d));
    conn.on('close', () => this.lost());
    conn.on('error', () => this.lost());
  }

  lost() {
    if (this.closed) return;
    this.close();
    this.onClose?.();
  }

  send(msg) {
    if (this.conn?.open) this.conn.send(msg);
  }

  close() {
    this.closed = true;
    this.failJoin(new Error('Cancelled'));
    try { this.conn?.close(); } catch { /* already closed */ }
    try { this.peer?.destroy(); } catch { /* already destroyed */ }
  }
}
