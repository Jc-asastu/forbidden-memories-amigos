'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
module.exports=async({window,store,DATA,prepareGame,setupJob,publish})=>{
 const js=s=>window.webContents.executeJavaScript(s),first=process.argv.includes('--qa-recovery-import');
 if(first){
  if(!store.state.profiles.length)store.create('Usuario conservado');
  await assert.rejects(()=>prepareGame(process.env.FM_AMIGOS_QA_DISC),/Interrupción simulada/);
  assert(store.state.settings.discPath);assert(store.state.settings.discVerified);assert.equal(fs.statSync(store.state.settings.discPath).size,517872768);
  assert(!setupJob.busy);
 }else{assert(store.state.settings.discPath);assert(!setupJob.busy);assert.equal(fs.readFileSync(path.join(DATA,'compiler-attempts'),'utf8'),'1');}
 publish();await new Promise(r=>setTimeout(r,350));
 assert(await js("document.getElementById('setup-add-game').getClientRects().length===0"));
 assert(await js("document.getElementById('retry-setup').textContent==='Continuar preparación' && !document.getElementById('retry-setup').hidden"));
 fs.writeFileSync(path.join(DATA,first?'import-result.json':'reopen-result.json'),JSON.stringify({imageRetained:true,noImagePicker:true,explicitResume:true,compilerAttempts:fs.readFileSync(path.join(DATA,'compiler-attempts'),'utf8').length}));
};

