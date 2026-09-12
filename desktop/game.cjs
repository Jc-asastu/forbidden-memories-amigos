'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {EventEmitter} = require('node:events');
const {writeAtomic} = require('./store.cjs');
const {ensureKeyboard} = require('./keyboard.cjs');
const {prepareDisc} = require('./disc.cjs');
const EXE = 'Yu_Gi_Oh_Forbidden_Memories_Recompiled.exe';
function gameEnvironment(extra = {}) {
  // Do not inherit debugging/cheat/network switches from another game session.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PSX_') && !key.startsWith('YGOFM_')));
  return {...env, ...extra};
}
function launchSpec({exe, disc, saveDir, name, online}) {
  const args = ['--disc', disc, '--memcard-dir', saveDir, '--no-launcher', '--window-title', `Forbidden Memories · ${name}`];
  const env = gameEnvironment();
  if (online) {
    args.push('--netplay', '--net-slot', String(online.slot), '--net-input-player', '0', '--net-bind', online.bind, '--net-delay', '4', '--net-session-id', String(online.session));
    if (online.peer) args.push('--net-peer', online.peer);
    Object.assign(env, {PSX_NETPLAY: '1', PSX_NET_TRANSPORT: 'lan', PSX_NET_MODE: 'delay', PSX_NET_SLOTS: '2', PSX_NET_SLOT: String(online.slot), PSX_NET_INPUT_PLAYER: '0', PSX_NET_DELAY: '4', PSX_NET_SESSION_ID: String(online.session), PSX_NET_BIND: online.bind, PSX_NET_PEER: online.peer});
  }
  return {exe, args, options: {cwd: path.dirname(exe), env, windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe']}};
}
class GameRunner extends EventEmitter {
  constructor(store, root) { super(); this.store = store; this.root = root; this.child = null; this.mode = null; }
  paths() {
    const s = this.store.state.settings;
    const candidates = [s.gameExe, path.join(this.root, 'runtime', EXE), path.join(this.root, 'runtime', 'build-release', EXE)].filter(Boolean);
    return {exe: candidates.find(p => fs.existsSync(p)) || '', disc: s.discPath || ''};
  }
  check() {
    const p = this.paths();
    if (!p.exe) throw new Error('Falta preparar el juego. Abrí Ajustes y elegí el ejecutable de la recompilación.');
    if (!p.disc || !fs.existsSync(p.disc)) throw new Error('Elegí tu imagen de Forbidden Memories en Ajustes.');
    return p;
  }
  start(online = null) {
    if (this.child) throw new Error('Cerrá la ventana del juego antes de iniciar otra partida.');
    const p = this.check(); ensureKeyboard(p.exe); const profile = this.store.profile();
    this.store.backup(profile.id);
    const saveDir = online ? online.saveDir : this.store.profileDir(profile.id);
    const disc = prepareDisc(p.disc, saveDir);
    const spec = launchSpec({...p, disc, saveDir, name: profile.name, online});
    const logPath = path.join(saveDir, 'last-game.log');
    writeAtomic(logPath, '');
    const child = spawn(spec.exe, spec.args, spec.options); this.child = child; this.mode = online ? 'online' : 'campaign';
    for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { try { fs.appendFileSync(logPath, chunk); } catch {} });
    child.once('error', error => this.emit('problem', `No se pudo abrir el juego: ${error.message}`));
    child.once('close', (code, signal) => {
      this.child = null; const mode = this.mode; this.mode = null;
      this.emit('exit', {mode, code, signal});
    });
    this.emit('started', {mode: this.mode}); return {running: true, mode: this.mode};
  }
  stopOnline() { if (this.child && this.mode === 'online') this.child.kill(); }
}
module.exports = {GameRunner, launchSpec, gameEnvironment, EXE};
