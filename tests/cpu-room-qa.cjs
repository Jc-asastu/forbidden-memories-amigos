'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async({window,store,runner,DATA,publish})=>{
 const js=s=>window.webContents.executeJavaScript(s),wait=async fn=>{for(let i=0;i<50;i++){if(await fn())return;await new Promise(r=>setTimeout(r,100))}throw Error('CPU UI timeout')};
 await wait(()=>js('!!state'));await js('document.getElementById("launcher-yes").click()');await wait(()=>js('document.getElementById("launcher").hidden'));
 const original=fs.readFileSync(path.join(store.profileDir(store.state.selected),'card1.mcd'));
 await js('document.getElementById("go-cpu").click()');await wait(()=>js('page==="cpu" && state.cpu?.opponentReady'));
 assert(await js('document.getElementById("cpu-stage").textContent.includes("2/2")'));
 for(const id of ['easy','medium','hard']){await js('action("cpu-difficulty",{id:'+JSON.stringify(id)+'})');assert.equal(store.state.settings.cpuDifficulty,id);assert(await js('document.getElementById("cpu-description").textContent.length>15'));}
 await js('document.getElementById("cpu-start").focus();document.getElementById("cpu-start").dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowRight",bubbles:true}))');
 assert(await js('document.activeElement.id==="cpu-exit"'));
 await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await new Promise(r=>setTimeout(r,700));
 fs.writeFileSync(path.join(DATA,'cpu-room.png'),(await window.webContents.capturePage()).toPNG());
 await js('document.getElementById("cpu-exit").click()');await wait(()=>js('page==="home" && !state.cpu'));
 assert(original.equals(fs.readFileSync(path.join(store.profileDir(store.state.selected),'card1.mcd'))));
 // Same launcher key path that used to leave an active online match on Escape.
 await js('state.network.room={state:"playing"};state.game.running=true;page="rooms";document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}));');
 assert(await js('state.network.room?.state==="playing"'));publish();
 fs.writeFileSync(path.join(DATA,'cpu-room-result.json'),JSON.stringify({roomCreated:true,opponentReady:true,difficultyPersists:true,keyboardNavigation:true,campaignUntouched:true,escapeProtected:true}));
};

