'use strict';
const {spawn}=require('node:child_process');
const REPO='Jc-asastu/forbidden-memories-amigos';
const API='repos/'+REPO+'/contents/meeting.json';
const URL='https://raw.githubusercontent.com/'+REPO+'/main/meeting.json';
function gh(args,input){return new Promise((resolve,reject)=>{const p=spawn('gh',['api',...args],{windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']});let out='',err='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);p.on('error',()=>reject(Error('No se pudo publicar el punto de encuentro desde esta PC.')));p.on('close',code=>code?reject(Error('No se pudo actualizar el punto de encuentro. Revisá la sesión de GitHub del anfitrión.')):resolve(out));p.stdin.end(input||'');});}
function valid(url){const u=new globalThis.URL(url);if(u.protocol!=='https:'||!u.hostname.endsWith('.trycloudflare.com')||u.username||u.password||u.pathname!=='/')throw Error('El punto de encuentro no es válido.');return u.origin;}
async function publishMeeting(url){url=valid(url);let previous;try{previous=JSON.parse(await gh([API]));}catch{}const data={message:'Update friends meeting point',content:Buffer.from(JSON.stringify({service:'Forbidden Memories Amigos',url,updatedAt:new Date().toISOString()})).toString('base64'),...(previous?.sha?{sha:previous.sha}:{})};await gh(['--method','PUT',API,'--input','-'],JSON.stringify(data));return url;}
async function discover(){try{const r=await fetch(URL+'?t='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error();const data=await r.json();const url=valid(data.url);const h=await fetch(url+'/health',{signal:AbortSignal.timeout(8000)});if(!h.ok||(await h.json()).service!=='Forbidden Memories Amigos')throw Error();return url;}catch{throw Error('El punto de encuentro está apagado. Juan debe abrir Multiplayer en su PC. Podés volver a intentar en unos segundos.');}}
module.exports={discover,publishMeeting,valid};
