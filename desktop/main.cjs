'use strict';
const {app, BrowserWindow, ipcMain, dialog, shell, clipboard} = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const {WebSocket} = require('ws');
const {LocalStore} = require('./store.cjs');
const {GameRunner} = require('./game.cjs');
const {installRuntime} = require('./install.cjs');
const {startTunnel} = require('./tunnel.cjs');
const {importImage,setupStatus,DISC_SHA1} = require('./setup.cjs');
const {buildRuntime,cancelBuild} = require('./build-runtime.cjs');
const {storagePath,spaceInfo,checkSpace}=require('./storage.cjs');
const {ensureKeyboard} = require('./keyboard.cjs');
const {discover,publishMeeting}=require('./meeting.cjs');
const {normalize}=require('./video.cjs');
const {starterList} = require('../shared/starters.cjs');
const {createBridge} = require('./relay.cjs');
const {decodeOnlineCard, cardHash} = require('../shared/memory-card.cjs');
const {startServer, PROTOCOL} = require('../server/index.cjs');
app.disableHardwareAcceleration();
app.setAppUserModelId('com.fmamigos.game');
const ROOT = path.resolve(__dirname, '..');
const DATA = process.env.FM_AMIGOS_DATA_DIR || path.join(process.env.LOCALAPPDATA || app.getPath('appData'), 'ForbiddenMemoriesAmigos');
fs.mkdirSync(DATA, {recursive: true}); app.setPath('userData', path.join(DATA, 'window'));
const primaryInstance = app.requestSingleInstanceLock();
if (!primaryInstance) app.quit();
app.on('second-instance', () => { if (window && !window.isDestroyed()) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); } });
let store, runner, window, socket, localServer, tunnel, match, quitting = false;
const setupJob={busy:false,stage:'',progress:0,error:''};
const net = {connected: false, connecting: false, id: null, rooms: [], room: null, status: 'Sin conexión', hosting: false, addresses: [], internetUrl: '', openingInternet: false};
const report = (message, kind = 'info') => { if (window && !window.isDestroyed()) window.webContents.send('notice', {message, kind}); };
function heavyData(){return storagePath(store.state.settings,DATA,{packaged:app.isPackaged});}
function snapshot() { return {local: store.snapshot(), network: net, game: {running: !!runner.child, mode: runner.mode, ...runner.paths()}, build: '0.5.9-amigos-0.5', starters: starterList(), setup: {...setupStatus(store,runner,setupJob),storage:spaceInfo(heavyData())}}; }
function publish() { if (window && !window.isDestroyed()) window.webContents.send('state', snapshot()); }
function send(value) { if (!socket || socket.readyState !== WebSocket.OPEN) throw new Error('Conectate al servidor de salas primero.'); socket.send(JSON.stringify(value)); }
function endMatch(notifyServer = false) {
  if (match) { match.bridge?.close(); match = null; runner.stopOnline(); }
  if (notifyServer && socket?.readyState === WebSocket.OPEN) send({type: 'end'});
}
async function message(data, binary) {
  if (binary) { match?.bridge?.receive(data); return; }
  const m = JSON.parse(data.toString());
  if (m.type === 'welcome') { net.id = m.id; net.connected = true; net.connecting = false; net.status = 'Conectado'; }
  if (m.type === 'rooms') net.rooms = m.rooms;
  if (m.type === 'room') net.room = m.room;
  if (m.type === 'error') report(m.message, 'error');
  if (m.type === 'match-ended') { endMatch(false); report(m.reason); }
  if (m.type === 'prepare') {
    if (runner.child || match) throw new Error('Ya hay una partida abierta.');
    runner.check();
    if (!Array.isArray(m.cards) || m.cards.length !== 2 || ![0, 1].includes(m.slot)) throw new Error('La sesión recibida no es válida.');
    const cards = m.cards.map(decodeOnlineCard);
    if (cards.some((card, i) => cardHash(card) !== m.hashes?.[i])) throw new Error('El guardado no llegó completo. Volvé a iniciar el duelo.');
    const prepared = {session: m.session, slot: m.slot, saveDir: store.sessionDirectory(m.session, cards), bridge: null};
    match = prepared;
    prepared.bridge = await createBridge({slot: m.slot, send: bytes => {
      if (socket?.readyState === WebSocket.OPEN && match === prepared) socket.send(bytes, {binary: true});
    }, onError: error => { report(error.message, 'error'); endMatch(true); }});
    if (match !== prepared) { prepared.bridge.close(); return; }
    send({type: 'prepared', session: m.session}); net.status = 'Preparando el duelo…';
  }
  if (m.type === 'launch') {
    if (!match || match.session !== m.session) throw new Error('La sesión ya no está disponible.');
    runner.start({...match, bind: match.bridge.bind, peer: match.bridge.peer});
    net.status = 'Duelo abierto';
    report('En el menú original, elegí 2P DUEL. El creador usa el primer jugador y su amigo el segundo.');
  }
  publish();
}
async function connect(url) {
  if (runner.child || net.room || net.connecting) throw new Error('Salí de la partida o sala actual antes de cambiar de servidor.');
  const profile = store.profile();
  url = String(url || '').trim().replace(/^https:/i, 'wss:').replace(/^http:/i, 'ws:'); if (!/^wss?:\/\//i.test(url)) url = `ws://${url}`;
  const parsed = new URL(url); if (!['ws:', 'wss:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('La dirección del servidor no es válida.');
  if (socket) socket.close();
  store.settings({serverUrl: url}); net.connecting = true; net.connected = false; net.status = 'Conectando…'; publish();
  const ws = new WebSocket(url, {handshakeTimeout: 10000, maxPayload: 600 * 1024, perMessageDeflate: false}); socket = ws;
  ws.on('open', () => { if (socket === ws) send({type: 'hello', protocol: PROTOCOL, name: profile.name}); });
  ws.on('message', (data, binary) => { if (socket === ws) message(data, binary).catch(e => { report(e.message, 'error'); endMatch(true); }); });
  ws.on('error', () => { if (socket === ws) report('No se pudo conectar al servidor. Comprobá la dirección y que esté encendido.', 'error'); });
  ws.on('close', () => {
    if (socket !== ws) return;
    endMatch(false); socket = null; Object.assign(net, {connected: false, connecting: false, id: null, room: null, rooms: [], status: 'Sin conexión'}); publish();
  });
}
async function openMeeting(internet){
 if(!localServer){const s=startServer({host:'127.0.0.1'});await s.ready;localServer=s;net.hosting=true;}
 if(internet&&!net.internetUrl){net.openingInternet=true;net.status='Abriendo Multiplayer…';publish();
 const vendor=fs.existsSync(path.join(process.resourcesPath,'vendor','cloudflared.exe'))?path.join(process.resourcesPath,'vendor'):path.join(ROOT,'vendor');
 try{tunnel=startTunnel({exe:path.join(vendor,'cloudflared.exe'),port:8787,directory:path.join(DATA,'connection'),onExit:()=>{net.internetUrl='';tunnel=null;socket?.close();if(!quitting){net.status='Acceso interrumpido';report('El acceso online se cerró. Volvé a entrar a Multiplayer.','error');publish();}}});net.internetUrl=await tunnel.ready;
 }finally{net.openingInternet=false;publish();}}
 if(internet&&store.state.settings.meetingPublisher){net.status='Publicando salas para tus amigos…';publish();await publishMeeting(net.internetUrl);}
 if(!net.connected)await connect('ws://127.0.0.1:8787');
}
async function prepareGame(file){
 if(setupJob.busy)throw Error('Esperá a que termine la preparación.');
 Object.assign(setupJob,{busy:true,error:'',stage:'Preparando tu juego…',progress:0});publish();
 try{const destination=heavyData();store.settings({setupSource:file});checkSpace(destination);const settings=await importImage(file,destination,progress=>{Object.assign(setupJob,progress);publish();});
 const exe=await buildRuntime(ROOT,destination,settings.discPath,progress=>{Object.assign(setupJob,progress);publish();});ensureKeyboard(exe);store.settings({...settings,gameExe:exe,setupSource:''});
 }catch(e){setupJob.error=e.message;throw e;}finally{setupJob.busy=false;publish();}
}
function register() {
  ipcMain.handle('action', async (event, action, payload = {}) => {
    if (event.sender !== window.webContents) throw new Error('Unknown window');
    try {
      if(action==='choose-storage'){
        if(runner.child||net.room||setupJob.busy)throw Error('Esperá a que termine la preparación o cerrá el juego antes de cambiar la carpeta.');
        const selected=await dialog.showOpenDialog(window,{title:'Elegí el disco para las descargas y el juego',defaultPath:heavyData(),properties:['openDirectory','createDirectory']});
        if(!selected.canceled){const destination=path.join(selected.filePaths[0],'ForbiddenMemoriesAmigos-GameData');checkSpace(destination);store.settings({storagePath:destination});setupJob.error='';publish();}
        return {ok:true,state:snapshot()};
      }
      if(action==='retry-setup'){
        if(runner.child||net.connected||setupJob.busy)throw Error('Cerrá el juego y desconectate antes de preparar.');
        const source=store.state.settings.setupSource||store.state.settings.discPath;if(!source)throw Error('Agregá tu imagen del juego con el botón +.');await prepareGame(source);return {ok:true,state:snapshot()};
      }
      if(action==='complete-setup'){if(!setupStatus(store,runner,setupJob).ready)throw Error('Primero agregá tu nombre y el juego.');store.settings({onboardingDone:true});publish();return {ok:true,state:snapshot()};}
      if(action==='choose-disc'){
        if(runner.child||net.connected||net.connecting||setupJob.busy)throw Error('Cerrá el juego y desconectate antes de cambiar la imagen.');
        const selected=await dialog.showOpenDialog(window,{title:'Agregá tu imagen del juego',filters:[{name:'Imagen de Forbidden Memories',extensions:['bin','cue','img']}],properties:['openFile']});
        if(!selected.canceled)await prepareGame(selected.filePaths[0]);return {ok:true,state:snapshot()};
      }
      if (action === 'controls-seen') { store.settings({controlsGuideVersion: 1}); publish(); return {ok: true, state: snapshot()}; }
      if (action === 'snapshot') return {ok: true, state: snapshot()};
      if (action === 'create-profile' || action === 'select-profile' || action === 'import-save') {
        if(setupJob.busy)throw Error('Esperá a que termine la preparación.');
        if (runner.child || net.connected || net.connecting) throw new Error('Cerrá el juego y desconectate antes de cambiar de usuario o guardado.');
        if (action === 'create-profile') store.create(payload.name);
        if (action === 'select-profile') store.select(payload.id);
        if (action === 'import-save') {
          const result = await dialog.showOpenDialog(window, {title: 'Elegí tu guardado de Forbidden Memories', filters: [{name: 'Guardados PS1', extensions: ['mcd', 'mcr']}], properties: ['openFile']});
          if (!result.canceled) store.importSave(result.filePaths[0]);
        }
      } else if (action === 'choose-disc' || action === 'choose-exe') {
        if (runner.child || net.room) throw new Error('Cerrá el juego y salí de la sala antes de cambiar estos ajustes.');
        const isDisc = action === 'choose-disc';
        const result = await dialog.showOpenDialog(window, {title: isDisc ? 'Elegí la imagen de tu disco' : 'Elegí el juego recompilado', filters: [{name: isDisc ? 'Imagen de disco PS1' : 'Juego Windows', extensions: isDisc ? ['bin', 'cue', 'img', 'iso'] : ['exe']}], properties: ['openFile']});
        if (!result.canceled) store.settings({[isDisc ? 'discPath' : 'gameExe']: result.filePaths[0]});
      } else if (action === 'choose-deck') {
        if (runner.child || (net.room && net.room.state !== 'waiting')) throw new Error('Esperá a terminar el duelo para cambiar de mazo.');
        store.setOnlineDeck(payload.id);
        if (net.room?.players.find(p => p.id === net.id)?.ready) send({type: 'ready', ready: false});
      } else if (action === 'campaign') {
        if (net.room) throw new Error('Salí de la sala online antes de abrir la campaña.'); if(!setupStatus(store,runner,setupJob).ready)throw Error('Completá los pasos de Inicio para preparar el juego.'); runner.start();
      } else if (action === 'connect') await connect(payload.url);
      else if (action === 'disconnect') { endMatch(true); socket?.close(); }
      else if(action==='enter-multiplayer') {
        if(!setupStatus(store,runner,setupJob).ready)throw Error('Primero prepará el juego.');
        if(net.connected)return {ok:true,state:snapshot()};
        if(net.openingInternet||net.connecting)return {ok:true,state:snapshot()};
        if(store.state.settings.meetingPublisher)await openMeeting(true);
        else {net.status='Buscando el punto de encuentro…';publish();try{await connect(await discover());}catch(e){net.status='Punto de encuentro apagado';publish();throw e;}}
      } else if(action==='save-video') {
        if(runner.child)throw Error('Cerrá el juego para aplicar los ajustes de video.');
        store.settings({video:normalize(payload)});
      } else if(action==='host-server'||action==='host-internet') {await openMeeting(action==='host-internet');
      } else if (action === 'create-room') { if (runner.child) throw new Error('Cerrá el juego primero.'); send({type: 'create', name: payload.name, private: payload.private === true}); }
      else if (action === 'join-room') { if (runner.child) throw new Error('Cerrá el juego primero.'); send({type: 'join', id: payload.id, code: payload.code}); }
      else if (action === 'leave-room') { endMatch(false); send({type: 'leave'}); }
      else if (action === 'ready') {
        if (runner.child) throw new Error('Cerrá la ventana del juego antes de prepararte.');
        runner.check();
        if (payload.ready === false) send({type: 'ready', ready: false});
        else send({type: 'ready', card: store.onlineSave().toString('base64'), build: 'ygofm-0.5.9-amigos-v5-fixed13', deckLabel: store.onlineDeckName()});
      } else if (action === 'start-match') send({type: 'start'});
      else if (action === 'refresh') send({type: 'list'});
      else if (action === 'copy-server') { if (net.internetUrl) clipboard.writeText(net.internetUrl); }
      else if (action === 'copy-code') { if (net.room?.code) clipboard.writeText(net.room.code); }
      else if (action === 'open-saves') await shell.openPath(store.profileDir(store.state.selected));
      else if (action === 'quit') { window.close(); return {ok: true}; }
      else throw new Error('Acción desconocida.');
      publish(); return {ok: true, state: snapshot()};
    } catch(error) { return {ok: false, error: error.message}; }
  });
}
app.whenReady().then(async () => {
  if (!primaryInstance) return;
  store = new LocalStore(DATA);
  const bundledDisc = path.join(process.resourcesPath, 'disc', 'Yu-Gi-Oh! Forbidden Memories (USA).bin');
  if (!store.state.settings.discPath && fs.existsSync(bundledDisc)) store.settings({discPath: bundledDisc});
  const defaults = path.join(ROOT, 'local-install.json');
  if (fs.existsSync(defaults) && !store.state.settings.discPath) store.settings(JSON.parse(fs.readFileSync(defaults, 'utf8')));
  if (!store.state.settings.gameExe) { const exe = installRuntime(ROOT, DATA); if (exe) store.settings({gameExe: exe}); }
  runner = new GameRunner(store, ROOT);
  runner.on('problem', text => report(text, 'error'));
  runner.on('started', publish);
  runner.on('exit', e => { if (e.mode === 'online') endMatch(true); if (e.code && !e.signal) report('El juego se cerró con un error. Se conservó el registro junto al guardado.', 'error'); publish(); });
  window = new BrowserWindow({width: 1160, height: 800, minWidth: 880, minHeight: 640, title: 'Forbidden Memories · Amigos', icon: path.join(ROOT, 'assets', 'app.ico'), backgroundColor: '#141019', autoHideMenuBar: true, show: !process.argv.includes('--qa'), webPreferences: {preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: !process.argv.includes('--qa')}});
  window.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.on('close', event => {
    if (quitting) return;
    if(setupJob.busy){const answer=dialog.showMessageBoxSync(window,{type:'question',buttons:['Seguir preparando','Cancelar y salir'],defaultId:0,cancelId:0,message:'El juego se está preparando.',detail:'Si salís ahora, podés reintentar la preparación al volver.'});if(answer===0){event.preventDefault();return;}cancelBuild();}
    if (runner.child) {
      const response = dialog.showMessageBoxSync(window, {type: 'question', buttons: ['Volver al juego', 'Cerrar todo'], defaultId: 0, cancelId: 0, message: 'El juego sigue abierto.', detail: 'Guardá desde el juego antes de cerrar para conservar el progreso.'});
      if (response === 0) { event.preventDefault(); return; }
    }
    quitting = true; runner.child?.kill(); endMatch(false); socket?.close(); tunnel?.stop(); localServer?.close();
  });
  register(); await window.loadFile(path.join(ROOT, 'ui', 'index.html'));
  if(process.argv.includes('--qa-setup-empty')){if(!process.env.FM_AMIGOS_DATA_DIR)throw Error('QA needs isolated data.');store.settings({discPath:'',discVerified:'',onboardingDone:false});}
  if(store.state.settings.discPath && (store.state.settings.discVerified!==DISC_SHA1||!fs.existsSync(store.state.settings.discPath))){try{await prepareGame(store.state.settings.discPath);}catch{}}
  if(store.state.settings.discVerified===DISC_SHA1&&runner.paths().exe&&!fs.existsSync(path.join(path.dirname(runner.paths().exe),'.amigos-runtime-v5'))){try{Object.assign(setupJob,{busy:true,stage:'Actualizando tu juego…',progress:null});publish();const destination=heavyData();checkSpace(destination);const exe=await buildRuntime(ROOT,destination,store.state.settings.discPath,p=>{Object.assign(setupJob,p);publish();});store.settings({gameExe:exe});}catch(e){setupJob.error=e.message;}finally{setupJob.busy=false;publish();}}
  publish();
  if(process.argv.includes('--multiplayer')&&setupStatus(store,runner,setupJob).ready)await window.webContents.executeJavaScript("showPage('rooms')");
  if (process.argv.includes('--qa')) {
    if(process.argv.includes('--qa-setup-file')){if(!store.state.profiles.length)store.create('Juan');publish();}
    if(process.argv.includes('--qa-setup-flow')){
      if(!process.env.FM_AMIGOS_DATA_DIR)throw Error('QA needs isolated data.');
      if(store.state.profiles.length)throw Error('QA setup starts from an empty profile list.');
      if(!await window.webContents.executeJavaScript("document.getElementById('page-setup').hidden===false && document.getElementById('setup-profile-panel').hidden===false && !document.querySelector('dialog[open]')"))throw Error('First-start dashboard missing.');
      await window.webContents.executeJavaScript("action('create-profile',{name:'Nuevo jugador'})");
      if(!await window.webContents.executeJavaScript("document.getElementById('setup-game-panel').hidden===false"))throw Error('Add-game step missing.');
      const originalPicker=dialog.showOpenDialog;
      try{
        dialog.showOpenDialog=async()=>({canceled:true,filePaths:[]});await window.webContents.executeJavaScript("action('choose-disc')");if(setupJob.busy||setupJob.error)throw Error('Cancel changed setup.');
        const invalid=path.join(DATA,'invalid.bin');fs.writeFileSync(invalid,'not a game');dialog.showOpenDialog=async()=>({canceled:false,filePaths:[invalid]});
        if(await window.webContents.executeJavaScript("action('choose-disc')"))throw Error('Invalid image accepted.');
        if(!setupJob.error||setupJob.busy||store.state.settings.discVerified)throw Error('Invalid import recovery failed.');
        dialog.showOpenDialog=async()=>({canceled:false,filePaths:[process.env.FM_AMIGOS_QA_DISC]});
        if(!await window.webContents.executeJavaScript("action('choose-disc')"))throw Error('Compatible image rejected.');
      }finally{dialog.showOpenDialog=originalPicker;}
      if(!setupStatus(store,runner,setupJob).ready||!store.state.settings.discPath.startsWith(path.join(DATA,'library')))throw Error('Setup did not prepare a local copy.');
      if(!await window.webContents.executeJavaScript("document.getElementById('setup-ready-panel').hidden===false"))throw Error('Ready choices missing.');
      const reopened=new LocalStore(DATA);if(!setupStatus(reopened,runner,setupJob).ready)throw Error('Setup not persistent.');
      fs.writeFileSync(path.join(DATA,'setup-result.json'),JSON.stringify({firstDashboard:true,profileThenImage:true,cancelSafe:true,invalidFileRejected:true,retryValid:true,ownedCopy:true,ready:true,persists:true}));
    }
    if(process.argv.includes('--qa-controls-flow')) {
      if(!process.env.FM_AMIGOS_DATA_DIR)throw Error('QA needs isolated data.');
      if(!store.state.profiles.length)store.create('Teclado QA');
      store.settings({controlsGuideVersion:0});publish();
      await window.webContents.executeJavaScript("document.querySelectorAll('dialog[open]').forEach(d=>d.close())");
      for(const expression of ["action('campaign')","action('ready',{ready:true})"]){
        await window.webContents.executeJavaScript('window.qaPending='+expression+'; true');
        if(!await window.webContents.executeJavaScript("document.getElementById('controls-dialog').open"))throw Error('Missing first-play controls guide.');
        await window.webContents.executeJavaScript("document.getElementById('controls-cancel').click(); window.qaPending");
        if(runner.child||store.state.settings.controlsGuideVersion===1)throw Error('Cancel must preserve first-play guide and not launch.');
      }
      await window.webContents.executeJavaScript("window.qaPending=action('campaign'); true");
      if(!await window.webContents.executeJavaScript("document.getElementById('controls-continue').click(); window.qaPending"))throw Error('Guide did not continue into campaign.');
      await new Promise(r=>setTimeout(r,3000));
      if(!runner.child||store.state.settings.controlsGuideVersion!==1)throw Error('Campaign/guide persistence failed.');
      const keys=fs.readFileSync(path.join(path.dirname(runner.paths().exe),'keybinds.ini'),'utf8');
      if(!keys.includes('cross = Q')||!keys.includes('square = W')||!keys.includes('circle = E')||!keys.includes('triangle = R'))throw Error('Native keybinds missing.');
      runner.child.kill();await new Promise(r=>runner.once('exit',r));
      fs.writeFileSync(path.join(DATA,'controls-result.json'),JSON.stringify({campaignGuide:true,onlineGuide:true,cancelSafe:true,acceptedLaunch:true,guideRemembered:true,nativeQWER:true}));
    }
    if (process.argv.includes('--qa-smoke')) {
      if (!process.env.FM_AMIGOS_DATA_DIR) throw new Error('QA needs an isolated data directory.');
      if (!store.state.profiles.length) store.create('Prueba de instalación');
      runner.start();
      await new Promise(resolve => setTimeout(resolve, 12000));
      if (!runner.child || runner.child.exitCode !== null) throw new Error('Native game did not stay open.');
      fs.writeFileSync(path.join(DATA, 'smoke-result.json'), JSON.stringify({nativeRunning: true, exe: runner.paths().exe, disc: runner.paths().disc, hasCards: fs.existsSync(path.join(store.profileDir(store.state.selected), 'card1.mcd'))}, null, 2));
      runner.child.kill();
      await new Promise(resolve => runner.once('exit', resolve));
      publish();
    }
    if(process.argv.includes('--qa-storage')) {
      if(!process.env.FM_AMIGOS_DATA_DIR)throw Error('QA requires isolated storage');
      if(!store.state.profiles.length)store.create('Amigo almacenamiento');publish();
      const oldPicker=dialog.showOpenDialog;const before=JSON.stringify(store.state.profiles);
      try{
        const original=store.state.settings.storagePath;dialog.showOpenDialog=async()=>({canceled:true,filePaths:[]});await window.webContents.executeJavaScript("action('choose-storage')");if(store.state.settings.storagePath!==original)throw Error('Cancel changed folder');
        const target=path.join(DATA,'otro disco con espacio');fs.mkdirSync(target,{recursive:true});dialog.showOpenDialog=async()=>({canceled:false,filePaths:[target]});await window.webContents.executeJavaScript("action('choose-storage')");if(heavyData()!==path.join(target,'ForbiddenMemoriesAmigos-GameData'))throw Error('Folder not selected');
        const invalid=path.join(DATA,'invalid.bin');fs.writeFileSync(invalid,'invalid');store.settings({setupSource:invalid});await window.webContents.executeJavaScript("action('retry-setup')");if(!setupJob.error||setupJob.busy)throw Error('Retry failure not recoverable');
        if(before!==JSON.stringify(store.state.profiles))throw Error('Profiles changed');
        if(!await window.webContents.executeJavaScript("document.getElementById('choose-storage').getClientRects().length>0 && !document.getElementById('choose-storage').disabled && !document.getElementById('retry-setup').hidden"))throw Error('Recovery controls hidden');
        const reread=new LocalStore(DATA);if(reread.state.settings.storagePath!==heavyData())throw Error('Folder not persistent');
        fs.writeFileSync(path.join(DATA,'storage-result.json'),JSON.stringify({pickerCancelSafe:true,chosenFolder:true,persists:true,retryRecoverable:true,profilePreserved:true,recoveryButtonsVisible:true}));
      }finally{dialog.showOpenDialog=oldPicker;}
    }
    if(process.argv.includes('--qa-arena')) await require('../tests/arena-qa.cjs')({window,store,net,connect,DATA,publish});
    if(process.argv.includes('--qa-rooms')) {
      if(!process.env.FM_AMIGOS_DATA_DIR)throw Error('QA needs isolated data.');
      if(!store.state.profiles.length)store.create('Juan');
      publish();
      await window.webContents.executeJavaScript("document.querySelectorAll('dialog[open]').forEach(d=>d.close()); document.querySelector('[data-page=rooms]').click()");
    }
    if(process.argv.includes('--qa-controls')) await window.webContents.executeJavaScript("document.querySelectorAll('dialog[open]').forEach(d=>d.close()); document.getElementById('show-controls').click()");
    await window.webContents.executeJavaScript("document.fonts.ready.then(() => true)");
    await new Promise(resolve => setTimeout(resolve, 1000));
    await window.webContents.executeJavaScript("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
    await new Promise(resolve=>setTimeout(resolve,200));
    const reportPath = process.env.FM_AMIGOS_QA_OUTPUT;
    if (reportPath) { fs.mkdirSync(path.dirname(reportPath), {recursive: true}); const shot = await window.webContents.capturePage(); fs.writeFileSync(reportPath, shot.resize({width: 870}).toJPEG(70)); }
    if(process.argv.includes('--qa-controls')&&process.env.FM_AMIGOS_QA_GUIDE){const rect=await window.webContents.executeJavaScript("(()=>{const r=document.getElementById('controls-dialog').getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)}})()");fs.writeFileSync(process.env.FM_AMIGOS_QA_GUIDE,(await window.webContents.capturePage(rect)).toPNG());}
    quitting = true; app.quit();
  }
}).catch(e => { if (process.argv.includes('--qa')) console.error(e.stack || e.message); else dialog.showErrorBox('No se pudo abrir Forbidden Memories Amigos', e.message); app.quit(); });
app.on('window-all-closed', () => app.quit());
