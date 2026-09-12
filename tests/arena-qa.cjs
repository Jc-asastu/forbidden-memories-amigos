'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');const {WebSocket}=require('ws');const {startServer,PROTOCOL}=require('../server/index.cjs');
module.exports=async({window,store,net,connect,DATA,publish})=>{
 const server=startServer({port:0,host:'127.0.0.1'});const {port}=await server.ready;let guest;
 const wait=async fn=>{for(let i=0;i<100;i++){if(await fn())return;await new Promise(r=>setTimeout(r,100));}throw Error('Arena timed out');};
 const js=s=>window.webContents.executeJavaScript(s);
 try{
  store.settings({onboardingDone:true,controlsGuideVersion:1});if(!store.state.profiles.length)store.create('Prueba Juan');publish();await connect('ws://127.0.0.1:'+port);await wait(()=>net.connected);
  guest=new WebSocket('ws://127.0.0.1:'+port);guest.on('open',()=>guest.send(JSON.stringify({type:'hello',name:'Prueba Amigo',protocol:PROTOCOL})));guest.on('message',bytes=>{const m=JSON.parse(bytes);if(m.type==='welcome')guest.send(JSON.stringify({type:'create',name:'Duelo entre amigos'}));});
  await wait(()=>net.rooms.length===1);await js("showPage('rooms')");
  assert(await js("document.body.classList.contains('in-arena') && document.getElementById('legacy-rooms').getClientRects().length===0"));
  assert(await js("document.querySelector('.arena-room').textContent.includes('1/2')"));
  window.webContents.sendInputEvent({type:'keyDown',keyCode:'DOWN'});window.webContents.sendInputEvent({type:'keyUp',keyCode:'DOWN'});
  await js("document.querySelector('.arena-room').focus()");window.webContents.sendInputEvent({type:'keyDown',keyCode:'ENTER'});window.webContents.sendInputEvent({type:'keyUp',keyCode:'ENTER'});
  await wait(()=>net.room?.players.length===2);assert(await js("document.getElementById('arena-ready')!==null"));
  await js("action('ready',{ready:true})");await wait(()=>net.room.players.some(p=>p.id===net.id&&p.ready));
  await js("action('choose-deck',{id:'mage'})");await wait(()=>!net.room.players.find(p=>p.id===net.id).ready);
  await js("action('leave-room')");await wait(()=>!net.room);await js("action('create-room',{name:'Sala privada QA',private:true})");await wait(()=>net.room?.private);assert(!net.rooms.some(r=>r.id===net.room.id));assert(net.room.code.length===6);
  await js("action('leave-room')");await wait(()=>!net.room);
  await js("action('save-video',{preset:'hd',scale:4,filter:1,texture:1,fps:144,screen:0})");assert.equal(store.state.settings.video.scale,4);assert.equal(store.state.settings.video.fps,144);
  await js("showPage('rooms');document.querySelector('.arena-room').focus()");
  await js("document.fonts.ready.then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))");await new Promise(r=>setTimeout(r,1000));fs.writeFileSync(path.join(DATA,'arena.png'),(await window.webContents.capturePage()).toPNG());
  fs.writeFileSync(path.join(DATA,'arena-result.json'),JSON.stringify({referenceLayout:true,publicListing:true,keyboardEnterJoins:true,ready:true,deckChangeUnready:true,privateHidden:true,privateCode:true,videoPersists:true}));
 }finally{guest?.terminate();await js("action('disconnect')");await server.close();}
};
