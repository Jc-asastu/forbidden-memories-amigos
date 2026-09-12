'use strict';
const net = require('node:net');

// This port belongs to the child game and listens only on loopback.
function query(port, message, signal) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1');
    let text = '', done = false;
    const finish = (error, value) => {
      if (done) return;
      done = true; signal?.removeEventListener('abort', abort); socket.destroy();
      error ? reject(error) : resolve(value);
    };
    const abort = () => finish(Error('Preparación cancelada.'));
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener('abort', abort, {once: true});
    socket.setTimeout(5000);
    socket.on('connect', () => socket.write(JSON.stringify({...message, id: 1}) + '\n'));
    socket.on('error', error => finish(error));
    socket.on('timeout', () => finish(Error('El juego no respondió a tiempo.')));
    socket.on('end', () => finish(Error('El juego cerró la conexión.')));
    socket.on('data', bytes => {
      text += bytes;
      if (text.length > 1048576) { finish(Error('Respuesta inválida del juego.')); return; }
      let value;
      try { value = JSON.parse(text); } catch { return; }
      if (!value || value.ok !== true) finish(Error(value?.error || 'Respuesta inválida del juego.'));
      else finish(null, value);
    });
  });
}
function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(Error('Preparación cancelada.')); return; }
    const abort = () => { clearTimeout(timer); reject(Error('Preparación cancelada.')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
    signal?.addEventListener('abort', abort, {once: true});
  });
}

// Screen signatures from the supported USA image. Never write game RAM.
function classify(menu, mode) {
  if (mode === 0xc3) return 'duel-loading';
  if (menu.length < 64) return 'unknown';
  const pointer = menu.readUInt32LE(0);
  if (menu[4] === 2 && menu[6] === 1 && menu[7] === 128 && pointer === 0 && menu.readUInt32LE(16) === 0x800f0548) return 'rules';
  if (pointer === 0x800f0af8 && menu[6] === 0) {
    if (menu[7] === 128) return menu[13] === 1 ? 'cards' : 'menu';
    if (menu[9] === 1) return 'title';
  }
  return 'loading';
}
async function readRam(q, addr, len) {
  const {hex} = await q({cmd: 'read_ram', addr, len});
  if (typeof hex !== 'string' || hex.length !== len * 2 || !/^[0-9a-f]+$/i.test(hex)) throw Error('Lectura incompleta del juego.');
  return Buffer.from(hex, 'hex');
}
async function readState(q) {
  const mode = (await readRam(q, '8009B26C', 1))[0];
  const menu = await readRam(q, '80184590', 64);
  return {mode, menu, screen: classify(menu, mode)};
}
async function handReady(q) {
  const s = await readState(q);
  if (s.mode !== 0xc3) return false;
  const lp = await readRam(q, '800EA004', 34);
  if (lp.readUInt16LE(0) !== 8000 || lp.readUInt16LE(32) !== 8000) return false;
  const hand = await readRam(q, '801A7AD8', 140);
  for (let i = 0; i < 5; i++) if (!(hand.readUInt16LE(i * 28 + 22) & 0x8000)) return false;
  return true;
}
async function prepareDirectDuel({port, slot, signal, onStage = () => {}, timeout = 180000}, dependencies = {}) {
  if (![0, 1].includes(slot)) throw Error('Jugador de la sesión no válido.');
  const q = dependencies.query || (message => query(port, message, signal));
  const pause = dependencies.sleep || (ms => sleep(ms, signal));
  const now = dependencies.now || Date.now, deadline = now() + timeout;
  async function wait(predicate) {
    while (now() < deadline) {
      if (signal?.aborted) throw Error('Preparación cancelada.');
      try { const value = await predicate(); if (value) return value; }
      catch (error) { if (signal?.aborted) throw error; }
      await pause(140);
    }
    throw Error('No se pudo llegar al primer turno. Volvé a la sala y reintentá.');
  }
  // Persistent neutral input prevents a held keyboard key leaking into boot.
  const neutral = () => q({cmd: 'set_input', buttons: 'FFFF'});
  async function press(mask) {
    await q({cmd: 'set_input', buttons: (65535 ^ mask).toString(16)});
    try { await pause(160); } finally { if (!signal?.aborted) await neutral(); }
    await pause(160);
  }
  async function act(mask, eligible, expected) {
    let last = -Infinity;
    return wait(async () => {
      const current = await readState(q);
      if (expected(current)) return current;
      // Retry only while still on the originating screen; never mash into a duel.
      if (eligible(current) && now() - last > 900) { last = now(); await press(mask); }
      return false;
    });
  }
  onStage('Cargando el duelo…');
  await wait(async () => { await q({cmd: 'frame'}); return true; });
  await neutral();
  if (slot === 0) {
    let state = await wait(async () => { const s = await readState(q); return ['title', 'menu'].includes(s.screen) ? s : false; });
    if (state.screen === 'title') state = await act(8, s => s.screen === 'title', s => s.screen === 'menu');
    onStage('Preparando los mazos…');
    for (let tries = 0; state.menu[4] !== 2 && tries < 8; tries++) {
      const row = state.menu[4];
      state = await act(row < 2 ? 64 : 16, s => s.screen === 'menu' && s.menu[4] === row, s => s.screen === 'menu' && s.menu[4] !== row);
    }
    if (state.menu[4] !== 2) throw Error('No se pudo seleccionar el duelo.');
    onStage('Cargando las dos tarjetas…');
    await act(0x4000, s => s.screen === 'menu' && s.menu[4] === 2, s => s.screen === 'cards');
    await act(0x4000, s => s.screen === 'cards', s => s.screen === 'rules');
    onStage('Entrando al primer turno…');
    await act(8, s => s.screen === 'rules', s => s.screen === 'duel-loading');
  }
  await wait(() => handReady(q));
  await neutral();
  onStage('Esperando al otro duelista…');
  return {firstTurn: true};
}
module.exports = {query, classify, readState, handReady, prepareDirectDuel};
