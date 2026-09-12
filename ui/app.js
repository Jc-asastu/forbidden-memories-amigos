'use strict';
const $ = id => document.getElementById(id); let state, page = 'home', toastTimer;
function notice(message, kind = 'info') { $('toast').textContent = message; $('toast').className = kind; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, kind === 'error' ? 10000 : 7000); }
async function action(name, payload) {
  if(name==='choose-disc'){clearTimeout(toastTimer);$('toast').hidden=true;}
  if((name==='campaign'||(name==='ready'&&payload?.ready!==false))&&state?.local.settings.controlsGuideVersion!==1){if(!await showControls(true))return false;if(!await action('controls-seen'))return false;}
  try { const result = await window.amigos.action(name, payload); if (!result.ok) { notice(result.error, 'error'); return false; } if (result.state) render(result.state); return true; }
  catch { notice('No se pudo completar la acción.', 'error'); return false; }
}
function showPage(next) { page = next; document.body.classList.toggle('in-arena',next==='rooms');if(next==='rooms'&&window.enterArena)window.enterArena(); for (const name of ['setup', 'home', 'rooms', 'settings']) $(`page-${name}`).hidden = name !== page; document.querySelectorAll('[data-page]').forEach(el => el.classList.toggle('active', el.dataset.page === page)); $('breadcrumb').textContent = {setup:'TODO LISTO, PASO A PASO', home: 'EL DUELO CONTINÚA', rooms: 'UN LUGAR PARA ENCONTRARSE', settings: 'TU JUEGO, A TU MANERA'}[page]; }
function node(tag, text, className) { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (className) el.className = className; return el; }
function button(text, className, callback) { const el = node('button', text, className); el.onclick = callback; return el; }
function render(next) {
  state = next; const {local, network, game} = state; const me = local.profiles.find(p => p.id === local.selected);
  renderSetup(me);
  renderDecks(me, network, game);
  $('profiles').replaceChildren(...local.profiles.map(p => { const opt = node('option', p.name); opt.value = p.id; return opt; }));
  if (!me) $('profiles').append(node('option', 'Creá tu usuario')); else $('profiles').value = me.id;
  $('profiles').disabled = game.running || network.connected || network.connecting;
  $('new-profile').disabled = $('profiles').disabled;
  $('greeting').textContent = me ? `Tu turno, ${me.name}.` : 'Volvé al duelo.';
  $('save-title').textContent = me?.hasSave ? 'Tu partida está guardada' : 'Tu aventura empieza acá';
  $('save-description').textContent = me?.saveError || (me?.hasSave ? 'Podés continuar la campaña o llevar tu mazo a una sala.' : me ? 'Entrá a la campaña y elegí «Grabar» para conservar tu progreso.' : 'Creá tu usuario para comenzar.');
  $('play-campaign').disabled = !state.setup?.ready || !me || game.running || !!network.room; $('game-running').hidden = !game.running;
  $('connection-text').textContent = network.status; $('connection-dot').classList.toggle('online', network.connected);
  $('exe-path').textContent = game.exe || 'Sin seleccionar'; $('disc-path').textContent = game.disc || 'Sin seleccionar';
  $('connect-panel').hidden = network.connected; $('lobby').hidden = !network.connected || !!network.room;
  $('current-room').hidden = !network.room; $('refresh').disabled = !network.connected;
  if (document.activeElement !== $('server-url')) $('server-url').value = local.settings.serverUrl || '';
  $('connect-form').querySelector('button').disabled = !me || network.connecting;
  $('host-server').disabled = !me || network.connecting || network.openingInternet;
  $('host-internet').disabled = !me || network.connecting || network.openingInternet;
  $('host-internet').textContent = network.openingInternet ? 'Abriendo acceso…' : 'Abrir salas para mis amigos';
  $('internet-sharing').hidden = !network.internetUrl; $('internet-url').textContent = network.internetUrl || ''; 
  $('hosting-info').textContent = network.hosting ? `Servidor abierto en esta PC. Red local: ${network.addresses.join(' · ') || '127.0.0.1:8787'}` : '';
  $('room-list').replaceChildren();
  if (!network.rooms.length) { const empty = node('div', undefined, 'empty'); empty.append(node('h3', 'Todavía no hay mesas abiertas.'), node('p', 'Creá una sala pública y esperá a que llegue un amigo.')); $('room-list').append(empty); }
  for (const r of network.rooms) {
    const row = node('div', undefined, 'room-row'); const details = node('div'); details.append(node('h3', r.name), node('p', `${r.players.length}/2 jugadores · ${r.state === 'waiting' ? 'Esperando rival' : 'Duelo en curso'}`));
    const join = button('Entrar →', 'secondary', () => action('join-room', {id: r.id})); join.disabled = r.players.length >= 2 || r.state !== 'waiting' || game.running; row.append(details, join); $('room-list').append(row);
  }
  $('current-room').replaceChildren();
  if (network.room) {
    const r = network.room, box = $('current-room'); box.append(node('p', r.private ? 'SALA PRIVADA' : 'SALA PÚBLICA', 'eyebrow'), node('h3', r.name));
    if (r.private) { const code = node('p', 'Código: ', 'code-box'); code.append(node('strong', r.code), button('Copiar', 'link', () => { action('copy-code'); notice('Código copiado.'); })); box.append(code); }
    const players = node('div', undefined, 'players');
    for (let i = 0; i < 2; i++) { const p = r.players[i]; const tile = node('div', undefined, `player${p?.ready ? ' ready' : ''}`); tile.append(node('strong', p?.name || 'Esperando…'), node('small', p ? `${p.id === network.id ? 'Vos · ' : ''}${p.ready ? 'Listo para jugar' : 'Preparando su mazo'}${p.deckLabel ? ' · ' + p.deckLabel : ''}` : 'Un lugar para tu amigo')); players.append(tile); }
    box.append(players);
    const self = r.players.find(p => p.id === network.id), controls = node('div', undefined, 'room-actions');
    const ready = button(self?.ready ? 'Cancelar listo' : 'Estoy listo', 'secondary', () => action('ready', {ready: !self?.ready})); ready.disabled = r.state !== 'waiting' || game.running; controls.append(ready);
    if (r.hostId === network.id) { const start = button('Iniciar duelo', 'primary', () => action('start-match')); start.disabled = r.players.length !== 2 || !r.players.every(p => p.ready) || r.state !== 'waiting'; controls.append(start); }
    controls.append(button('Salir de la sala', 'link', () => action('leave-room'))); box.append(controls);
    box.append(node('p', r.state === 'preparing' ? 'Sincronizando las partidas…' : r.state === 'playing' ? (state.game.bootStage || 'Duelo en curso. Los controles están en la ventana del juego.') : 'Cada uno juega con el mazo que eligió arriba.', 'subtle'));
  }
  if(window.renderArena)window.renderArena();
}
document.querySelectorAll('[data-page]').forEach(b => b.onclick = () => showPage(b.dataset.page));
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => b.closest('dialog').close());
$('new-profile').onclick = () => { $('profile-name').value = ''; $('profile-dialog').showModal(); $('profile-name').focus(); };
$('profile-form').onsubmit = async e => { e.preventDefault(); if (await action('create-profile', {name: $('profile-name').value})) $('profile-dialog').close(); };
$('profiles').onchange = () => action('select-profile', {id: $('profiles').value});
$('play-campaign').onclick = () => action('campaign'); $('go-rooms').onclick = () => showPage('rooms');
for (const name of ['choose-disc', 'choose-exe', 'open-saves', 'import-save', 'refresh', 'disconnect', 'host-server', 'host-internet']) $(name).onclick = () => action(name);
$('copy-server').onclick = () => { action('copy-server'); notice('Dirección copiada para tus amigos.'); };
$('connect-form').onsubmit = e => { e.preventDefault(); action('connect', {url: $('server-url').value}); };
$('create-room').onclick = () => { const me = state.local.profiles.find(p => p.id === state.local.selected); $('room-name').value = `Sala de ${me.name}`; $('room-private').checked = false; privacy(); $('room-dialog').showModal(); };
function privacy() { $('privacy-help').textContent = $('room-private').checked ? 'Privada: compartí el código solo con quienes quieras invitar.' : 'Pública: tus amigos pueden verla y entrar directamente.'; }
$('room-private').onchange = privacy;
$('room-form').onsubmit = async e => { e.preventDefault(); if (await action('create-room', {name: $('room-name').value, private: $('room-private').checked})) $('room-dialog').close(); };
$('join-private').onclick = () => { $('room-code').value = ''; $('code-dialog').showModal(); $('room-code').focus(); };
$('code-form').onsubmit = async e => { e.preventDefault(); if (await action('join-room', {code: $('room-code').value})) $('code-dialog').close(); };
window.amigos.onState(render); window.amigos.onNotice(n => notice(n.message, n.kind));
action('snapshot');

function renderDecks(me, network, game) {
 const locked=!me||game.running||(network.room&&network.room.state!=='waiting');
 $('deck-choices').replaceChildren();
 for(const d of state.starters||[]){const chosen=me?.onlineDeck===d.id;const box=node('article',undefined,'deck-choice '+d.id+(chosen?' chosen':''));box.append(node('span',d.style,'eyebrow'),node('h3',d.name),node('p',d.description));const pick=button(chosen?'✓ Mazo elegido':'Elegir mazo',chosen?'primary':'secondary',()=>action('choose-deck',{id:d.id}));pick.disabled=locked;box.append(pick);const details=node('details');details.append(node('summary','Ver las 40 cartas'));const list=node('ul');for(const c of d.cardList){list.append(node('li',c.count+'× '+c.name+(c.type<20?' · '+c.atk+'/'+c.dfn:'')));}details.append(list);box.append(details);$('deck-choices').append(box);}
 $('campaign-deck').replaceChildren();if(me?.hasSave){const choose=button(me.onlineDeck==='campaign'?'✓ Usando mi mazo de campaña':'Usar mi mazo de campaña','link',()=>action('choose-deck',{id:'campaign'}));choose.disabled=locked;$('campaign-deck').append(choose);}
}

let controlsResolve=null;
function showControls(beforePlay=false){
 if($('controls-dialog').open)return Promise.resolve(false);
 $('controls-continue').textContent=beforePlay?'Entendido, continuar':'Entendido';
 $('controls-cancel').hidden=!beforePlay;
 $('controls-dialog').showModal();
 return new Promise(resolve=>{controlsResolve=resolve;});
}
function finishControls(accepted){$('controls-dialog').close();const resolve=controlsResolve;controlsResolve=null;resolve?.(accepted);}
$('show-controls').onclick=()=>showControls();
$('controls-continue').onclick=()=>finishControls(true);
$('controls-cancel').onclick=()=>finishControls(false);
$('controls-dialog').addEventListener('cancel',event=>{event.preventDefault();finishControls(false);});
document.addEventListener('keydown',event=>{if(event.key==='F1'){event.preventDefault();if(!document.querySelector('dialog[open]'))showControls();}});

function renderSetup(me){
 const setup=state.setup||{},ready=setup.ready;
 if(!ready||!state.local.settings.onboardingDone)showPage('setup');
 for(const id of ['home','rooms'])document.querySelector('[data-page='+id+']').disabled=!ready;
 $('setup-profile-panel').hidden=!!me;
 $('setup-game-panel').hidden=!me||setup.gameReady&&!setup.busy&&!setup.error;
 $('setup-ready-panel').hidden=!ready;
 $('setup-add-game').hidden=setup.busy;
 const disk=setup.storage||{};$('storage-path').textContent=disk.path||'';$('storage-space').textContent=(disk.freeBytes==null?'Espacio no disponible':(disk.freeBytes/1024**3).toFixed(1)+' GB libres')+' · Reservá 4 GB para la preparación inicial';$('choose-storage').disabled=setup.busy||state.game.running;$('retry-setup').hidden=setup.busy||!state.local.settings.setupSource&&!state.local.settings.discPath||setup.gameReady;
 $('setup-progress').hidden=!setup.busy;
 $('setup-stage').textContent=setup.stage||'Preparando…';$('setup-percent').textContent=setup.progress==null?'En progreso…':setup.progress+'%';if(setup.progress==null)$('setup-progress-bar').removeAttribute('value');else $('setup-progress-bar').value=setup.progress||0;
 $('setup-error').hidden=!setup.error;$('setup-error').textContent=setup.error||'';
 $('setup-ready-title').textContent=me?'Todo listo, '+me.name+'.':'Todo listo para jugar.';
 $('setup-profile-form').querySelector('button').disabled=!!setup.busy;
 $('setup-campaign').disabled=!ready||state.game.running||!!state.network.room;$('setup-online').disabled=!ready||state.game.running;
 $('setup-change-game').disabled=setup.busy||state.game.running||state.network.connected;
 const complete=[!!me,setup.gameReady,ready];for(const [i,id]of ['profile','game','play'].entries()){$('step-'+id).classList.toggle('complete',complete[i]);$('step-'+id).classList.toggle('current',i===(me?(setup.gameReady?2:1):0));$('step-'+id).querySelector('span').textContent=complete[i]?'✓':i+1;}
}
$('setup-profile-form').onsubmit=async event=>{event.preventDefault();await action('create-profile',{name:$('setup-name').value});};
$('setup-add-game').onclick=()=>action('choose-disc');$('setup-change-game').onclick=()=>action('choose-disc');
$('setup-controls').onclick=()=>showControls();
$('setup-campaign').onclick=async()=>{if(await action('complete-setup')){showPage('home');await action('campaign');}};
$('setup-online').onclick=async()=>{if(await action('complete-setup'))showPage('rooms');};

$('choose-storage').onclick=()=>action('choose-storage');$('retry-setup').onclick=()=>action('retry-setup');
