'use strict';
const {query,readState,handReady}=require('./direct-duel.cjs');
async function prepareCpuDuel({port,signal,onStage=()=>{},timeout=180000},deps={}){
 const q=deps.query||(m=>query(port,m,signal)),sleep=deps.sleep||(ms=>new Promise((r,j)=>{if(signal?.aborted)return j(Error('Duelo cancelado.'));const t=setTimeout(done,ms);function done(){signal?.removeEventListener('abort',cancel);r()}function cancel(){clearTimeout(t);j(Error('Duelo cancelado.'))}signal?.addEventListener('abort',cancel,{once:true})})),now=deps.now||Date.now,end=now()+timeout;
 async function wait(fn){while(now()<end){if(signal?.aborted)throw Error('Duelo cancelado.');try{const r=await fn();if(r)return r}catch(e){if(signal?.aborted)throw e;}await sleep(140)}throw Error('No pudimos iniciar el duelo contra la máquina. Volvé a intentar desde la sala.')}
 const state=()=>readState(q);
 async function press(mask){await q({cmd:'press',buttons:65535^mask,frames:6});await sleep(320);await q({cmd:'set_input',buttons:'FFFF'});}
 async function act(mask,eligible,done){let last=-Infinity;return wait(async()=>{const s=await state();if(done(s))return s;if(eligible(s)&&now()-last>1100){last=now();await press(mask)}return false})}
 onStage('Cargando la sala de práctica…');
 await wait(async()=>{await q({cmd:'frame'});return true});await q({cmd:'set_input',buttons:'FFFF'});
 let s=await wait(async()=>{const s=await state();return ['title','menu'].includes(s.screen)&&s.menu[4]<5?s:false});
 if(s.screen==='title')s=await act(8,s=>s.screen==='title',s=>s.screen==='menu');
 while(s.menu[4]!==1){const row=s.menu[4];s=await act(row<1?64:16,s=>s.screen==='menu'&&s.menu[4]===row,s=>s.screen==='menu'&&s.menu[4]!==row);}
 onStage('Cargando tu mazo de práctica…');
 // The game's LOAD dialog stays at menu row 1 until LOAD COMPLETE is dismissed.
 await act(0x4000,s=>s.menu[4]===1,s=>(s.mode===0||s.mode===0xc8)&&s.menu[4]>=5&&s.menu[4]<=10&&s.menu[10]===0);
 s=await state();while(s.menu[4]!==6){const row=s.menu[4];s=await act(row<6?64:16,s=>s.menu[4]===row,s=>s.menu[4]!==row);}
 await act(0x4000,s=>s.menu[4]===6&&s.mode!==0xc6,s=>s.mode===0xc6);
 onStage('La máquina está lista…');
 // Only Simon is unlocked in this session card; 40=Build Deck, 41=Simon.
 let attempts=0;await wait(async()=>{const s=await state();if(s.mode!==0xc6)return false;const x=await q({cmd:'read_ram',addr:'8009B32E',len:1});if(x.hex==='29')return true;if(attempts++%3===0)await press(0x4000);else await press(32);await sleep(500);return false});
 await act(0x4000,s=>s.mode===0xc6,s=>s.mode===0xc3);
 await act(0x2000,s=>s.mode===0xc3&&s.menu[4]===6,s=>s.mode===0xc3&&s.menu[4]!==6);
 onStage('Entrando al primer turno…');await wait(()=>handReady(q));await q({cmd:'clear_input'});onStage('Duelo contra la máquina en curso');return {firstTurn:true};
}
module.exports={prepareCpuDuel};

