// Tiny WebSocket server + event layer, built on Node's standard library only
// (so the game runs without `npm install`).
//
// Wire format (JSON text frames):
//   client -> server: { e: eventName, d: payload, id?: number }   (id => wants an ack)
//   server -> client: { e: eventName, d: payload } or { ack: id, d: response }

const crypto = require('crypto');
const { EventEmitter } = require('events');

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_MESSAGE = 256 * 1024;

class Conn extends EventEmitter {
  constructor(socket, id) {
    super();
    this.id = id;
    this.socket = socket;
    this.buf = Buffer.alloc(0);
    this.fragments = [];
    this.alive = true;
    this.closed = false;
    socket.setNoDelay(true);
    socket.on('data', (chunk) => this.onData(chunk));
    socket.on('close', () => this.finish());
    socket.on('error', () => this.finish());
  }

  onData(chunk) {
    this.buf = Buffer.concat([this.buf, chunk]);
    while (true) {
      if (this.buf.length < 2) return;
      const b0 = this.buf[0], b1 = this.buf[1];
      const fin = (b0 & 0x80) !== 0;
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f;
      let off = 2;
      if (len === 126) { if (this.buf.length < 4) return; len = this.buf.readUInt16BE(2); off = 4; }
      else if (len === 127) {
        if (this.buf.length < 10) return;
        const big = this.buf.readBigUInt64BE(2);
        if (big > BigInt(MAX_MESSAGE)) return this.close(1009);
        len = Number(big); off = 10;
      }
      if (len > MAX_MESSAGE) return this.close(1009);
      if (!masked) return this.close(1002); // clients must mask
      if (this.buf.length < off + 4 + len) return;
      const mask = this.buf.subarray(off, off + 4);
      const payload = Buffer.from(this.buf.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      this.buf = this.buf.subarray(off + 4 + len);

      if (opcode === 0x8) return this.close(1000);
      if (opcode === 0x9) { this.frame(0xa, payload); continue; }
      if (opcode === 0xa) { this.alive = true; continue; }
      if (opcode === 0x1 || opcode === 0x0) {
        this.fragments.push(payload);
        if (fin) {
          const text = Buffer.concat(this.fragments).toString('utf8');
          this.fragments = [];
          this.alive = true;
          this.onMessage(text);
        }
      }
    }
  }

  onMessage(text) {
    let msg;
    try { msg = JSON.parse(text); } catch { return; }
    if (!msg || typeof msg.e !== 'string') return;
    const ack = typeof msg.id === 'number' ? (res) => this.send({ ack: msg.id, d: res }) : undefined;
    try {
      this.emit('event', msg.e, msg.d || {}, ack);
    } catch (err) {
      console.error('handler error:', err);
      ack && ack({ ok: false, error: 'Server error' });
    }
  }

  frame(opcode, data) {
    if (this.closed) return;
    const len = data.length;
    let header;
    if (len < 126) { header = Buffer.from([0x80 | opcode, len]); }
    else if (len < 65536) { header = Buffer.alloc(4); header[0] = 0x80 | opcode; header[1] = 126; header.writeUInt16BE(len, 2); }
    else { header = Buffer.alloc(10); header[0] = 0x80 | opcode; header[1] = 127; header.writeBigUInt64BE(BigInt(len), 2); }
    this.socket.write(Buffer.concat([header, data]));
  }

  send(obj) { this.frame(0x1, Buffer.from(JSON.stringify(obj))); }

  close(code = 1000) {
    if (this.closed) return;
    const b = Buffer.alloc(2); b.writeUInt16BE(code, 0);
    try { this.frame(0x8, b); } catch {}
    this.socket.end();
    this.finish();
  }

  finish() {
    if (this.closed) return;
    this.closed = true;
    this.socket.destroy();
    this.emit('close');
  }
}

// A minimal socket.io-like API: io.on('connection'), socket.on(evt, (data, ack)),
// socket.join(room), io.to(roomOrSocketId).emit(evt, data).
class Realtime extends EventEmitter {
  constructor(server, path = '/ws') {
    super();
    this.conns = new Map();
    this.rooms = new Map(); // room -> Set(connId)
    let n = 0;

    server.on('upgrade', (req, socket) => {
      const url = req.url.split('?')[0];
      const key = req.headers['sec-websocket-key'];
      if (url !== path || !key || String(req.headers.upgrade).toLowerCase() !== 'websocket') {
        socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
        return;
      }
      const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
      socket.write(
        'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
      );
      const conn = new Conn(socket, `c${++n}_${crypto.randomBytes(4).toString('hex')}`);
      this.conns.set(conn.id, conn);
      const api = this.wrap(conn);
      conn.on('close', () => {
        this.conns.delete(conn.id);
        for (const set of this.rooms.values()) set.delete(conn.id);
        api._fire('disconnect');
      });
      this.emit('connection', api);
    });

    // Heartbeat: drop connections that stop answering pings (e.g. phone went to sleep).
    setInterval(() => {
      for (const c of this.conns.values()) {
        if (!c.alive) { c.finish(); continue; }
        c.alive = false;
        c.frame(0x9, Buffer.alloc(0));
      }
    }, 20000).unref();
  }

  wrap(conn) {
    const handlers = new Map();
    const api = {
      id: conn.id,
      on: (evt, fn) => { handlers.set(evt, fn); return api; },
      emit: (evt, data) => conn.send({ e: evt, d: data }),
      join: (room) => {
        if (!this.rooms.has(room)) this.rooms.set(room, new Set());
        this.rooms.get(room).add(conn.id);
      },
      leaveRoom: (room) => {
        const set = this.rooms.get(room);
        if (set) { set.delete(conn.id); if (!set.size) this.rooms.delete(room); }
      },
      _fire: (evt, data, ack) => { const fn = handlers.get(evt); if (fn) fn(data, ack); },
    };
    conn.on('event', (evt, data, ack) => {
      const fn = handlers.get(evt);
      if (fn) Promise.resolve(fn(data, ack)).catch((err) => {
        console.error(`error in "${evt}":`, err);
        ack && ack({ ok: false, error: 'Server error' });
      });
    });
    return api;
  }

  to(target) {
    return {
      emit: (evt, data) => {
        const ids = this.rooms.has(target) ? this.rooms.get(target) : [target];
        const msg = { e: evt, d: data };
        for (const id of ids) { const c = this.conns.get(id); if (c) c.send(msg); }
      },
    };
  }
}

module.exports = { Realtime };
