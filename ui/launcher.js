'use strict';
(()=>{
 const root=document.getElementById('launcher');let current,choosing=false,entered=false,entering=false,initial=true;
 root.innerHTML=`<div class="launcher-art" aria-hidden="true"></div><div class="launcher-shade" aria-hidden="true"></div><div class="launcher-glow" aria-hidden="true"></div><div class="launcher-dust" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></div>
 <div class="launcher-top"><span>FORBIDDEN MEMORIES <b>AMIGOS</b></span><span id="launcher-version"></span></div>
 <div class="launcher-content"><p class="launcher-kicker">EL TEMPLO VUELVE A ABRIRSE</p><h1>Tu próxima<br>leyenda <em>te espera.</em></h1><p class="launcher-subtitle">Tus cartas. Tu historia. Tus amigos.</p>
 <div class="launcher-identity"><p class="launcher-label">TU LUGAR EN LA MESA</p><h2 id="launcher-question">Bienvenido, duelista.</h2><p id="launcher-context">Un nombre es todo lo que necesitás para empezar.</p>
 <div id="launcher-confirm"><button id="launcher-yes" class="launcher-primary">Sí, continuar <span>→</span></button><button id="launcher-no" class="launcher-link">No, soy otro duelista</button></div>
 <form id="launcher-name-form" hidden><label for="launcher-name">Tu nombre de duelista</label><div class="launcher-name-row"><input id="launcher-name" maxlength="24" required autocomplete="off" placeholder="Escribí tu nombre"><button class="launcher-primary">Entrar →</button></div><button id="launcher-cancel-name" type="button" class="launcher-link">Volver a mi usuario</button></form>
 <p id="launcher-error" role="alert" hidden></p></div></div>
 <div class="launcher-bottom"><div class="launcher-library"><span class="library-seal">◇</span><div><strong id="launcher-library-title">Tu biblioteca personal</strong><small id="launcher-library-detail">La imagen y los guardados quedan en esta PC.</small></div></div>
 <div class="launcher-update"><div class="launcher-update-line"><span id="launcher-update-text" role="status">Preparando tu entrada…</span><span id="launcher-update-percent"></span></div><progress id="launcher-progress" max="100" aria-label="Progreso de actualización"></progress><div class="launcher-update-actions"><small id="launcher-update-note">Las actualizaciones conservan tus usuarios y partidas.</small><button id="launcher-update-button" class="launcher-link" hidden>Buscar novedades</button></div></div></div>`;
 const el=id=>document.getElementById(id);
 async function call(name,payload){const r=await window.amigos.action(name,payload);if(!r.ok)throw Error(r.error);if(r.state){window.renderLauncher(r.state);if(typeof render==='function')render(r.state);}return r.state;}
 function error(e){el('launcher-error').textContent=e.message;el('launcher-error').hidden=false;}
 async function enter(name){
  if(entering)return;entering=true;el('launcher-error').hidden=true;
  try{const s=await call(name===undefined?'confirm-user':'login-user',name===undefined?{}:{name});choosing=false;entered=true;root.hidden=true;document.body.classList.remove('at-launcher');document.querySelector('.app').inert=false;
   if(s.setup.ready){await call('complete-setup');showPage(s.launcher.startPage||'home');}else showPage('setup');
  }catch(e){error(e);}finally{entering=false;}
 }
 window.renderLauncher=s=>{
  current=s;const me=s.local.profiles.find(p=>p.id===s.local.selected),u=s.update||{};
  if(initial&&s.launcher?.confirmed){entered=true;root.hidden=true;document.body.classList.remove('at-launcher');}
  const first=initial;initial=false;
  if(!entered){root.hidden=false;document.body.classList.add('at-launcher');document.querySelector('.app').inert=true;}
  else document.querySelector('.app').inert=false;
  el('launcher-version').textContent='VERSIÓN '+(s.launcher?.version||'');
  el('launcher-question').textContent=choosing||!me?'¿Cómo te llamás?':'¿Sos '+me.name+'?';
  el('launcher-context').textContent=choosing?'Si ya jugaste con ese nombre, recuperamos tu perfil.':me?(me.hasSave?'Tu partida te espera donde la dejaste.':'Tu perfil está guardado. Todo listo para volver.'):'Sin contraseña. Tu nombre y tu progreso quedan acá.';
  el('launcher-confirm').hidden=choosing||!me;el('launcher-name-form').hidden=!!me&&!choosing;el('launcher-cancel-name').hidden=!me;
  const blocked=s.setup.busy||s.game.running||s.network.connected||s.network.connecting;
  el('launcher-yes').disabled=s.setup.busy;el('launcher-no').disabled=blocked;el('launcher-name-form').querySelector('[type=submit],button:not([type])').disabled=blocked;
  el('launcher-library-title').textContent=s.setup.gameReady?'Tu juego está guardado y listo':'Tu biblioteca personal';
  el('launcher-library-detail').textContent=s.setup.gameReady?'Imagen reconocida · '+s.local.profiles.length+' usuario'+(s.local.profiles.length===1?'':'s')+' en esta PC':'Agregás tu imagen una vez. La preparamos por vos.';
  const preparing=s.setup.busy;const progress=preparing?s.setup.progress:u.progress;
  el('launcher-update-text').textContent=preparing?s.setup.stage:u.message||'Buscando novedades…';
  el('launcher-update-percent').textContent=progress==null?'':Math.round(progress)+'%';
  const bar=el('launcher-progress');if(progress==null)bar.removeAttribute('value');else bar.value=progress;
  const update=el('launcher-update-button');update.hidden=preparing||['idle','checking','downloading'].includes(u.status);update.disabled=s.game.running||!!s.network.room;
  update.textContent=u.status==='available'?'Actualizar a '+u.version+' →':u.status==='downloaded'?'Instalar y volver a entrar →':u.status==='error'?'Reintentar':'Buscar novedades';
  if(first&&!entered)setTimeout(()=>el(me?'launcher-yes':'launcher-name').focus(),100);
  el('launcher-update-note').textContent=u.status==='available'?'Podés actualizar ahora o continuar con esta versión.':u.status==='downloaded'?'Cerramos y volvemos a abrir el launcher. Tu progreso se conserva.':'Tus usuarios, tu imagen y tus partidas se conservan.';
 };
 el('launcher-yes').onclick=()=>enter();
 el('launcher-no').onclick=()=>{choosing=true;window.renderLauncher(current);el('launcher-name').value='';el('launcher-name').focus();};
 el('launcher-cancel-name').onclick=()=>{choosing=false;window.renderLauncher(current);el('launcher-yes').focus();};
 el('launcher-name-form').onsubmit=e=>{e.preventDefault();enter(el('launcher-name').value);};
 el('launcher-update-button').onclick=async()=>{try{el('launcher-error').hidden=true;const s=current.update.status;if(s==='available'){await call('download-update');}else if(s==='downloaded'){await call('install-update');}else await call('check-update');}catch(e){error(e);}};
 document.addEventListener('DOMContentLoaded',()=>{el('back-launcher').onclick=()=>{entered=false;choosing=false;root.hidden=false;document.body.classList.add('at-launcher');document.querySelector('.app').inert=true;window.renderLauncher({...current,launcher:{...current.launcher,confirmed:false}});};});
 root.addEventListener('keydown',e=>{if(e.target.tagName==='INPUT')return;const buttons=[...root.querySelectorAll('button')].filter(b=>!b.disabled&&b.getClientRects().length);if(['ArrowDown','ArrowRight','ArrowUp','ArrowLeft'].includes(e.key)){e.preventDefault();let i=buttons.indexOf(document.activeElement);buttons[(i+(e.key==='ArrowUp'||e.key==='ArrowLeft'?-1:1)+buttons.length)%buttons.length]?.focus();}else if(e.key==='Enter'&&e.target===document.body&&!el('launcher-confirm').hidden)enter();});
})();

