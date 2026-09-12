'use strict';
let selectedRoom=null,enteringArena=false,arenaMuted=false,arenaAudio;
function menuSound(confirm=false){if(arenaMuted)return;try{arenaAudio??=new AudioContext();arenaAudio.resume();const now=arenaAudio.currentTime;for(const [offset,freq]of(confirm?[[0,440],[.065,660],[.13,880]]:[[0,520],[.025,780]])){const o=arenaAudio.createOscillator(),g=arenaAudio.createGain();o.type='triangle';o.frequency.value=freq;o.connect(g);g.connect(arenaAudio.destination);g.gain.setValueAtTime(0,now+offset);g.gain.linearRampToValueAtTime(.035,now+offset+.008);g.gain.exponentialRampToValueAtTime(.001,now+offset+.12);o.start(now+offset);o.stop(now+offset+.14);}}catch{}}
window.enterArena=async()=>{menuSound(true);if(enteringArena||state?.network.connected)return;enteringArena=true;await action('enter-multiplayer');enteringArena=false;renderArena();$('arena-create').focus();};
function focusable(root=$('page-rooms')){return [...root.querySelectorAll('button,input,select')].filter(e=>!e.disabled&&e.getClientRects().length);}
window.renderArena=()=>{
 if(!state)return;const n=state.network,me=state.local.profiles.find(p=>p.id===state.local.selected),r=n.room;const focused=document.activeElement?.id;
 $('arena-status').textContent=n.connected?'● Conectado · '+(r?'En sala':'Buscando duelo'):n.status;
 $('arena-status').classList.toggle('connected',n.connected);$('arena-count').textContent=n.rooms.length;
 if(!n.rooms.some(x=>x.id===selectedRoom))selectedRoom=n.rooms[0]?.id||null;
 $('arena-rooms').replaceChildren();for(const room of n.rooms){const b=button(room.name+'  '+room.players.length+'/2','arena-room'+(selectedRoom===room.id?' selected':''),()=>{selectedRoom=room.id;menuSound();renderArena();});b.id='room-'+room.id;b.setAttribute('role','option');b.setAttribute('aria-selected',selectedRoom===room.id);b.dataset.room=room.id;b.ondblclick=()=>joinSelected();$('arena-rooms').append(b);}
 $('arena-empty').hidden=!!n.rooms.length;$('arena-empty').textContent=n.connected?'No hay salas abiertas. Creá la primera.':n.status==='Punto de encuentro apagado'?'El salón está apagado. El anfitrión debe abrir Multiplayer.':'Conectando al salón…';
 const chosen=r||n.rooms.find(x=>x.id===selectedRoom);$('arena-title').textContent=chosen?.name||'Tu próximo duelo';$('arena-description').textContent=chosen?(chosen.private?'Sala privada · Código '+chosen.code:'Sala pública')+' · '+chosen.players.length+'/2 jugadores':'Elegí un mazo y creá una sala para tus amigos.';
 $('arena-members').replaceChildren();if(chosen)for(let i=0;i<2;i++){const p=chosen.players[i];const line=node('div',p?(p.ready?'◆ ':'◇ ')+p.name+(chosen.hostId===p.id?' · Líder':'')+(p.ready?' · Listo':''):'◇ Esperando rival…','arena-player');$('arena-members').append(line);}
 const select=$('arena-deck-select');const old=select.value;select.replaceChildren();for(const d of state.starters||[]){const o=node('option',d.name);o.value=d.id;select.append(o);}if(me?.hasSave){const o=node('option','Mi mazo de campaña');o.value='campaign';select.append(o);}select.value=me?.onlineDeck||old||'dragon';select.disabled=state.game.running||!!r&&r.state!=='waiting';
 $('arena-room-actions').replaceChildren();if(r){const self=r.players.find(p=>p.id===n.id);const ready=button(self?.ready?'Cancelar listo':'Estoy listo','arena-button',()=>action('ready',{ready:!self?.ready}));ready.id='arena-ready';ready.disabled=r.state!=='waiting'||state.game.running;$('arena-room-actions').append(ready);if(r.hostId===n.id){const start=button(r.state==='preparing'?'Sincronizando…':'Iniciar duelo','arena-button',()=>action('start-match'));start.id='arena-start';start.disabled=r.state!=='waiting'||r.players.length!==2||!r.players.every(p=>p.ready);$('arena-room-actions').append(start);}if(r.state==='playing')$('arena-room-actions').append(node('p',state.game.bootStage || 'Duelo en curso.','subtle'));}
 $('arena-create').disabled=!n.connected||!!r||state.game.running;$('arena-join').disabled=!n.connected||!!r||!chosen||chosen.players.length>=2||chosen.state!=='waiting'||state.game.running;
 $('arena-exit').textContent=r?'Salir de la sala':'Salir';$('arena-private-controls').hidden=!!r;$('arena-code-button').disabled=!n.connected;$('arena-retry').hidden=n.connected;$('arena-retry').disabled=n.connecting||n.openingInternet||enteringArena;
 if(focused&&document.getElementById(focused)?.getClientRects().length)document.getElementById(focused).focus({preventScroll:true});
 if(!document.activeElement?.closest('#video-form')){const v=state.local.settings.video||{preset:'balanced',scale:2,filter:1,texture:0,fps:0,screen:0};for(const k of ['preset','scale','filter','texture','fps','screen'])$('video-'+k).value=String(v[k]);}
};
async function joinSelected(){if(!$('arena-join').disabled){menuSound(true);await action('join-room',{id:selectedRoom});$('arena-ready')?.focus();}}
$('arena-create').onclick=async()=>{menuSound(true);const me=state.local.profiles.find(p=>p.id===state.local.selected);await action('create-room',{name:'Sala de '+me.name,private:$('arena-private').checked});$('arena-ready')?.focus();};
$('arena-join').onclick=joinSelected;
$('arena-exit').onclick=async()=>{menuSound();if(state.network.room)await action('leave-room');else showPage('home');};
$('arena-deck-select').onchange=()=>{menuSound();action('choose-deck',{id:$('arena-deck-select').value});};
$('arena-code-button').onclick=()=>$('join-private').click();$('arena-retry').onclick=()=>enterArena();
$('arena-audio').onclick=()=>{arenaMuted=!arenaMuted;$('arena-audio').textContent='Sonido: '+(arenaMuted?'desactivado':'activado');menuSound();};
document.addEventListener('keydown',e=>{
 if(document.body.classList.contains('at-launcher')||page!=='rooms')return;const dialog=document.querySelector('dialog[open]'),active=document.activeElement;
 if(e.key==='Escape'&&!dialog){e.preventDefault();$('arena-exit').click();return;}
 if(active?.tagName==='SELECT'||(active?.tagName==='INPUT'&&active.type!=='checkbox'))return;
 if(['ArrowDown','ArrowUp','ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();const list=focusable(dialog||$('page-rooms'));let i=list.indexOf(active);const dir=['ArrowUp','ArrowLeft'].includes(e.key)?-1:1;i=(i+dir+list.length)%list.length;list[i]?.focus();if(list[i]?.dataset.room){selectedRoom=list[i].dataset.room;renderArena();}menuSound();}
 if(e.key==='Enter'&&active?.dataset.room){e.preventDefault();joinSelected();}
});
$('video-preset').onchange=()=>{const p={performance:[1,0,0,0],balanced:[2,1,0,0],hd:[4,1,1,0],fluid:[2,1,1,120]}[$('video-preset').value];['scale','filter','texture','fps'].forEach((k,i)=>$('video-'+k).value=p[i]);};
$('video-form').onsubmit=async e=>{e.preventDefault();const v={preset:$('video-preset').value};for(const k of ['scale','filter','texture','fps','screen'])v[k]=Number($('video-'+k).value);if(await action('save-video',v))$('video-saved').textContent=' Guardado. Se aplica en la próxima partida.';};
