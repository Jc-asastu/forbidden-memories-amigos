'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');
const net=require('node:net');
const {prepareDirectDuel,query}=require('./direct-duel.cjs');
const {EventEmitter} = require('node:events');
const {writeAtomic} = require('./store.cjs');
const {ensureKeyboard} = require('./keyboard.cjs');
const {applyVideo}=require('./video.cjs');
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
    if (!require('./native-patch.cjs').runtimeCurrent(p.exe)) throw new Error('El motor necesita terminar la actualización antes de jugar.');
    if (!p.disc || !fs.existsSync(p.disc)) throw new Error('Elegí tu imagen de Forbidden Memories en Ajustes.');
    return p;
  }
  async start(session = null) {
    const cpu=session?.kind==='cpu'?session:null,online=cpu?null:session,direct=cpu||online;
    if (this.child||this.starting) throw new Error('Cerrá la ventana del juego antes de iniciar otra partida.');
    const p = this.check(); ensureKeyboard(p.exe); const profile = this.store.profile();
    this.store.backup(profile.id);
    const saveDir = direct ? direct.saveDir : this.store.profileDir(profile.id);
    ensureKeyboard(p.exe,saveDir);
    const disc = prepareDisc(p.disc, saveDir);
    const spec = launchSpec({...p, disc, saveDir, name: profile.name, online});
    Object.assign(spec.options.env,applyVideo(saveDir,this.store.state.settings.video),{FM_AMIGOS_CONFIG_DIR:saveDir});
    if(direct){this.bootAbort=new AbortController();this.windowHandle=0;this.starting=true;try{this.debugPort=await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port));});});}finally{this.starting=false;}if(this.bootAbort.signal.aborted)throw Error('Preparación cancelada.');spec.args.push('--debug-port',String(this.debugPort));this.windowScript=path.join(saveDir,'native-window.ps1');fs.copyFileSync(path.join(__dirname,'native-window.ps1'),this.windowScript);}
    const logPath = path.join(saveDir, 'last-game.log');
    writeAtomic(logPath, '');
    const child = spawn(spec.exe, spec.args, spec.options); this.child = child; this.mode = cpu?'cpu':online ? 'online' : 'campaign';
    for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { try { fs.appendFileSync(logPath, chunk); } catch {} });
    child.once('error', error => this.emit('problem', `No se pudo abrir el juego: ${error.message}`));
    child.once('close', (code, signal) => {
      if(this.child!==child)return;this.bootAbort?.abort();this.windowWorker?.kill();this.child = null; const mode = this.mode; this.mode = null;this.bootStage='';
      this.emit('exit', {mode, code, signal});
    });
    if(online){this.bootStage='Cargando el duelo…';
      // Keep the native window visible throughout boot: a failed readiness check must never leave an audio-only game.
      this.hiddenWindow=Promise.resolve();
      prepareDirectDuel({port:this.debugPort,slot:online.slot,signal:this.bootAbort.signal,onStage:stage=>{this.bootStage=stage;fs.appendFileSync(logPath,'[amigos-boot] '+stage+'\n');this.emit('boot-stage',stage);},onDiagnostic:value=>{try{fs.appendFileSync(logPath,'[amigos-boot] '+JSON.stringify(value)+'\n');}catch{}}}).then(()=>{if(this.child===child)this.emit('duel-ready',{session:online.session});}).catch(e=>{if(this.child===child&&!this.bootAbort.signal.aborted){this.emit('problem',e.message);this.stopOnline();}});
    }
    if(cpu){this.bootStage='Cargando la sala de práctica…';
      require('./cpu-duel.cjs').prepareCpuDuel({port:this.debugPort,signal:this.bootAbort.signal,onStage:stage=>{this.bootStage=stage;fs.appendFileSync(logPath,'[amigos-cpu] '+stage+'\n');this.emit('boot-stage',stage);}}).then(()=>{if(this.child===child)this.emit('cpu-ready');}).catch(e=>{if(this.child===child&&!this.bootAbort.signal.aborted){this.emit('problem',e.message);child.kill();}});
    }
    this.emit('started', {mode: this.mode}); return {running: true, mode: this.mode};
  }
  windowAction(mode){return new Promise((resolve,reject)=>{const c=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',this.windowScript,'-GamePid',String(this.child.pid),'-Mode',mode,'-WindowHandle',String(this.windowHandle||0)],{windowsHide:true,stdio:['ignore','pipe','pipe']});this.windowWorker=c;let out='';c.stdout.on('data',b=>out+=b);c.on('error',reject);c.on('close',code=>code===0?resolve(Number(out.trim())||0):reject(Error('No se pudo mostrar el duelo.')));});}
  async revealDuel(){if(!this.child||this.mode!=='online')return;const child=this.child;await this.hiddenWindow;if(this.child!==child||this.bootAbort.signal.aborted)return;await this.windowAction('show');await query(this.debugPort,{cmd:'clear_input'},this.bootAbort.signal);this.bootStage='';this.emit('boot-stage','Duelo en curso');}
  stopOnline() {this.bootAbort?.abort();this.windowWorker?.kill(); if (this.child && this.mode === 'online') this.child.kill(); }
}
module.exports = {GameRunner, launchSpec, gameEnvironment, EXE};
