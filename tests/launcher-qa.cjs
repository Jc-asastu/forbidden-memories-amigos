'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {LocalStore}=require('../desktop/store.cjs');
module.exports=async({window,store,updater,DATA,publish,resetIdentity})=>{
 const js=s=>window.webContents.executeJavaScript(s),pause=()=>new Promise(r=>setTimeout(r,250));
 const wait=async fn=>{for(let i=0;i<80;i++){if(await fn())return;await new Promise(r=>setTimeout(r,100));}throw Error('Launcher QA timed out');};
 const result={};
 await wait(()=>js("!!state"));
 if(!store.state.profiles.length){
  assert(await js("!document.getElementById('launcher-name-form').hidden"));await js("document.getElementById('launcher-name').value='Primer amigo';document.getElementById('launcher-name-form').requestSubmit()");await wait(()=>store.profile()?.name==='Primer amigo');assert(await js("!document.getElementById('setup-game-panel').hidden"));result.firstUser=true;
 }else{
  const id=store.state.selected,name=store.profile().name,settings=JSON.stringify(store.state.settings),card=fs.readFileSync(path.join(store.profileDir(id),'card1.mcd'));
  assert(await js("document.getElementById('launcher-question').textContent.includes("+JSON.stringify(name)+")"));assert(await js("document.querySelector('.app').inert"));result.remembersUser=true;
  updater.set({status:'current',current:'0.7.0',progress:100,message:'Tenés la última versión.'});await pause();
  await js("document.fonts.ready");fs.writeFileSync(path.join(DATA,'launcher.png'),(await window.webContents.capturePage()).toPNG());
  await js("document.getElementById('launcher-no').click();document.getElementById('launcher-name').value='Otro amigo';document.getElementById('launcher-name-form').requestSubmit()");await wait(()=>store.profile().name==='Otro amigo');await wait(()=>js("document.getElementById('launcher').hidden"));result.newUser=true;
  assert.equal(store.state.settings.discPath,JSON.parse(settings).discPath);assert.deepEqual(fs.readFileSync(path.join(store.profileDir(id),'card1.mcd')),card);
  resetIdentity();await window.reload();await wait(()=>js("!!state && !document.getElementById('launcher').hidden"));assert(await js("document.getElementById('launcher-question').textContent.includes('Otro amigo')"));result.restart=true;
  await js("document.getElementById('launcher-no').click();document.getElementById('launcher-name').value="+JSON.stringify(name.toUpperCase())+";document.getElementById('launcher-name-form').requestSubmit()");await wait(()=>store.state.selected===id);assert.equal(store.state.profiles.length,2);result.existingUserRecovered=true;
  await js("document.getElementById('back-launcher').click()");await pause();updater.set({status:'available',version:'0.7.1',message:'Hay una nueva versión lista para vos.',progress:100});await pause();assert(await js("!document.getElementById('launcher').hidden && document.getElementById('launcher-update-button').textContent.includes('0.7.1')"));result.updateNotice=true;
  updater.set({status:'error',message:'No pudimos buscar actualizaciones. Podés jugar la campaña sin conexión.',progress:null});await pause();await js("document.getElementById('launcher-yes').click()");await wait(()=>js("document.getElementById('launcher').hidden"));assert(await js("!document.getElementById('play-campaign').disabled"));result.offlineContinue=true;
  const reopened=new LocalStore(DATA);assert.equal(reopened.state.selected,id);assert.deepEqual(fs.readFileSync(path.join(reopened.profileDir(id),'card1.mcd')),card);assert.equal(reopened.state.settings.discPath,JSON.parse(settings).discPath);result.imageAndSavesPreserved=true;
 }
 fs.writeFileSync(path.join(DATA,'launcher-result.json'),JSON.stringify(result,null,2));
};

