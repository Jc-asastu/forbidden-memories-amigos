'use strict';
const http = require('node:http');
const {randomUUID, randomInt} = require('node:crypto');
const {WebSocketServer, WebSocket} = require('ws');
const {decodeOnlineCard, cardHash} = require('../shared/memory-card.cjs');
const PROTOCOL = 1;
function startServer({port = 8787, host = '0.0.0.0', prepareTimeout = 90000, duelTimeout = 190000} = {}) {
  const rooms = new Map(); const clients = new Set();
  const httpServer = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (req.url === '/health') return res.end(JSON.stringify({service: 'Forbidden Memories Amigos', protocol: PROTOCOL, rooms: rooms.size}));
    res.statusCode = 404; res.end(JSON.stringify({error: 'Not found'}));
  });
  const wss = new WebSocketServer({server: httpServer, maxPayload: 600 * 1024, perMessageDeflate: false});
  const send = (ws, data) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data)); };
  function publicRoom(r, member = false) {
    return {id: r.id, name: r.name, private: !!r.code, state: r.state, players: r.members.map(m => ({id: m.id, name: m.name, ready: m.ready, deckLabel: m.deckLabel || null})), hostId: r.members[0]?.id, ...(member && r.code ? {code: r.code} : {})};
  }
  const listing = () => [...rooms.values()].filter(r => !r.code).map(r => publicRoom(r));
  function broadcastList() { for (const c of clients) if (c.id) send(c.ws, {type: 'rooms', rooms: listing()}); }
  function update(r) { for (const c of r.members) send(c.ws, {type: 'room', room: publicRoom(r, true)}); broadcastList(); }
  function cancel(r, reason) {
    clearTimeout(r.timer); r.state = 'waiting'; r.session = null;
    for (const c of r.members) { c.ready = false; c.card = null; c.prepared = false; c.inDuel=false; send(c.ws, {type: 'match-ended', reason}); }
  }
  function leave(c) {
    if (!c.room) return;
    const r = rooms.get(c.room); c.room = null; c.ready = false; c.card = null;
    if (!r) return;
    if (r.state !== 'waiting') cancel(r, 'El otro jugador salió de la sesión.');
    r.members = r.members.filter(m => m !== c);
    if (!r.members.length) { clearTimeout(r.timer); rooms.delete(r.id); broadcastList(); }
    else { for (const member of r.members) member.ready = false; update(r); }
    send(c.ws, {type: 'room', room: null});
  }
  function current(c) { const r = rooms.get(c.room); if (!r) throw new Error('No estás en una sala.'); return r; }
  function text(value, max, fallback) {
    const result = typeof value === 'string' ? value.trim().normalize('NFC') : fallback;
    if (!result || [...result].length > max || /[\u0000-\u001f\u007f]/.test(result)) throw new Error('Nombre no válido.'); return result;
  }
  wss.on('connection', ws => {
    const c = {ws, id: null, name: '', room: null, ready: false, alive: true}; clients.add(c);
    ws.on('pong', () => { c.alive = true; });
    ws.on('error', () => {});
    ws.on('close', () => { leave(c); clients.delete(c); });
    ws.on('message', (data, binary) => {
      try {
        if (binary) {
          const r = current(c);
          if (r.state !== 'playing' || data.length > 65507) return;
          for (const other of r.members) if (other !== c && other.ws.readyState === WebSocket.OPEN) {
            if (other.ws.bufferedAmount > 4 * 1024 * 1024) { cancel(r, 'La conexión no alcanza para mantener el duelo sincronizado.'); update(r); return; }
            other.ws.send(data, {binary: true});
          }
          return;
        }
        const m = JSON.parse(data.toString());
        if (!m || typeof m !== 'object') throw new Error('Mensaje no válido.');
        if (m.type === 'hello') {
          if (c.id) throw new Error('Ya estás conectado.');
          if (m.protocol !== PROTOCOL) throw new Error('Las versiones de la aplicación no coinciden.');
          c.name = text(m.name, 24, 'Jugador'); c.id = randomUUID();
          send(ws, {type: 'welcome', id: c.id, protocol: PROTOCOL, directDuel: true}); send(ws, {type: 'rooms', rooms: listing()}); return;
        }
        if (!c.id) throw new Error('Elegí un usuario para entrar.');
        if (m.type === 'list') { send(ws, {type: 'rooms', rooms: listing()}); return; }
        if (m.type === 'create') {
          if (c.room) throw new Error('Salí de tu sala actual antes de crear otra.');
          if (rooms.size >= 100) throw new Error('No hay más salas disponibles por ahora.');
          let code = null;
          if (m.private === true) do { code = randomInt(0, 36 ** 6).toString(36).toUpperCase().padStart(6, '0'); } while ([...rooms.values()].some(r => r.code === code));
          const r = {id: randomUUID(), name: text(m.name, 40, `Sala de ${c.name}`), code, members: [c], state: 'waiting', session: null};
          rooms.set(r.id, r); c.room = r.id; update(r); return;
        }
        if (m.type === 'join') {
          if (c.room) throw new Error('Salí de tu sala actual antes de entrar a otra.');
          const code = typeof m.code === 'string' ? m.code.trim().toUpperCase() : '';
          const r = code ? [...rooms.values()].find(r => r.code === code) : rooms.get(m.id);
          if (!r || (r.code && r.code !== code)) throw new Error('No se encontró la sala o el código no es correcto.');
          if (r.state !== 'waiting' || r.members.length >= 2) throw new Error('La sala está ocupada.');
          r.members.push(c); c.room = r.id; for (const member of r.members) member.ready = false; update(r); return;
        }
        if (m.type === 'leave') { leave(c); return; }
        const r = current(c);
        if (m.type === 'ready') {
          if (r.state !== 'waiting') throw new Error('El duelo ya se está preparando.');
          if (m.ready === false) { c.ready = false; c.card = null; update(r); return; }
          c.card = decodeOnlineCard(m.card);
          c.build = text(m.build, 96, '');
          c.deckLabel = text(m.deckLabel, 40, 'Mazo de campaña');
          c.ready = true; update(r); return;
        }
        if (m.type === 'start') {
          if (r.members[0] !== c) throw new Error('El creador de la sala inicia el duelo.');
          if (r.state !== 'waiting' || r.members.length !== 2 || !r.members.every(p => p.ready && p.card)) throw new Error('Los dos jugadores tienen que estar listos.');
          if (r.members[0].build !== r.members[1].build) throw new Error('Ambos necesitan la misma versión del juego.');
          r.state = 'preparing'; r.duelStarted=false; r.session = randomInt(1, 0x7fffffff);
          const cards = r.members.map(p => p.card.toString('base64')); const hashes = r.members.map(p => cardHash(p.card));
          r.members.forEach((p, slot) => { p.prepared = false; p.inDuel=false; send(p.ws, {type: 'prepare', session: r.session, slot, cards, hashes}); });
          r.timer = setTimeout(() => { if (r.state === 'preparing') { cancel(r, 'Se agotó el tiempo para preparar el juego.'); update(r); } }, prepareTimeout); r.timer.unref();
          update(r); return;
        }
        if (m.type === 'prepared') {
          if (r.state !== 'preparing' || m.session !== r.session) throw new Error('La sesión ya no está disponible.');
          c.prepared = true;
          if (r.members.every(p => p.prepared)) { clearTimeout(r.timer); r.state = 'playing'; if(r.members.every(p=>p.build.endsWith('-direct'))){r.timer=setTimeout(()=>{if(r.state==='playing'&&!r.members.every(p=>p.inDuel)){cancel(r,'No se pudo completar la carga del primer turno. Volvé a intentarlo.');update(r);}},duelTimeout);r.timer.unref();} for (const p of r.members) send(p.ws, {type: 'launch', session: r.session}); update(r); }
          return;
        }
        if(m.type==='duel-ready'){if(r.state!=='playing'||m.session!==r.session)throw Error('La sesión ya no está disponible.');c.inDuel=true;if(!r.duelStarted&&r.members.length===2&&r.members.every(p=>p.inDuel)){r.duelStarted=true;clearTimeout(r.timer);for(const p of r.members)send(p.ws,{type:'duel-go',session:r.session});}return;}
        if (m.type === 'end') { if (r.state !== 'waiting') { cancel(r, 'La sesión terminó. Tu partida local está conservada.'); update(r); } return; }
        throw new Error('Acción desconocida.');
      } catch (error) { send(ws, {type: 'error', message: error.message}); }
    });
  });
  const heartbeat = setInterval(() => { for (const c of clients) { if (!c.alive) c.ws.terminate(); else { c.alive = false; c.ws.ping(); } } }, 15000); heartbeat.unref();
  const ready = new Promise((resolve, reject) => { httpServer.once('error', reject); httpServer.listen(port, host, () => resolve(httpServer.address())); });
  async function close() {
    clearInterval(heartbeat); for (const r of rooms.values()) clearTimeout(r.timer);
    for (const c of clients) c.ws.terminate();
    await new Promise(resolve => wss.close(resolve)); await new Promise(resolve => httpServer.close(resolve));
  }
  return {ready, close, httpServer};
}
if (require.main === module) {
  const server = startServer({port: Number(process.env.PORT || 8787), host: process.env.HOST || '0.0.0.0'});
  server.ready.then(a => console.log(`Forbidden Memories Amigos — servidor en puerto ${a.port}`)).catch(e => { console.error(e.message); process.exitCode = 1; });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close().then(() => process.exit(0)));
}
module.exports = {startServer, PROTOCOL};
