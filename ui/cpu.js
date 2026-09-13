'use strict';
(()=>{
let opening=false;
window.enterCpu=async()=>{if(opening)return;opening=true;try{if(await action('open-cpu-room')){showPage('cpu');$('cpu-start').focus();}}finally{opening=false}};
$('go-cpu').onclick=window.enterCpu;$('setup-cpu').onclick=window.enterCpu;
window.renderCpu=s=>{
 const me=s.local.profiles.find(p=>p.id===s.local.selected),r=s.cpu,locked=s.game.running||r?.status==='preparing';
 $('go-cpu').disabled=!s.setup.ready||s.game.running||!!s.network.room;
 $('setup-cpu').disabled=$('go-cpu').disabled;
 if(!r)return;
 $('cpu-player-name').textContent=me?.name||'Duelista';
 const select=$('cpu-deck');select.replaceChildren();
 for(const d of s.starters){const opt=node('option',d.name);opt.value=d.id;select.append(opt)}
 if(me?.hasSave){const opt=node('option','Mi mazo de campaña');opt.value='campaign';select.append(opt)}
 select.value=me?.onlineDeck||'dragon';select.disabled=locked;$('cpu-difficulty').disabled=locked;$('cpu-difficulty').value=r.difficulty;
 $('cpu-description').textContent=r.difficulties.find(d=>d.id===r.difficulty)?.description||'';
 $('cpu-start').disabled=locked;$('cpu-start').textContent=r.status==='preparing'?'Preparando el duelo…':r.status==='playing'?'Duelo en curso':'Comenzar duelo →';
 $('cpu-exit').disabled=locked;$('cpu-stage').textContent=s.game.mode==='cpu'?s.game.bootStage||'Duelo en curso.':'Sala completa · 2/2 · Rival listo';
};
$('cpu-difficulty').onchange=()=>action('cpu-difficulty',{id:$('cpu-difficulty').value});
$('cpu-deck').onchange=()=>action('choose-deck',{id:$('cpu-deck').value});
$('cpu-start').onclick=()=>action('start-cpu');
$('cpu-exit').onclick=async()=>{if(await action('close-cpu-room'))showPage('home')};
document.addEventListener('keydown',e=>{
 if(page!=='cpu'||document.body.classList.contains('at-launcher')||document.querySelector('dialog[open]'))return;
 if(e.key==='Escape'){e.preventDefault();if(!state.game.running&&state.cpu?.status==='waiting')$('cpu-exit').click();return}
 if(e.target.tagName==='SELECT')return;
 if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();const controls=[...$('page-cpu').querySelectorAll('button,select')].filter(b=>!b.disabled);const dir=['ArrowUp','ArrowLeft'].includes(e.key)?-1:1;controls[(controls.indexOf(document.activeElement)+dir+controls.length)%controls.length]?.focus();}
});
if(state)window.renderCpu(state);
})();

