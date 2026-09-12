'use strict';
const {spawn}=require('node:child_process');const path=require('node:path'),fs=require('node:fs');
function startTunnel({exe,port,directory,onExit=()=>{}}){
 fs.mkdirSync(directory,{recursive:true});const config=path.join(directory,'tunnel.yml');fs.writeFileSync(config,'{}\n');
 const child=spawn(exe,['tunnel','--config',config,'--no-autoupdate','--url','http://127.0.0.1:'+port,'--protocol','http2','--metrics','127.0.0.1:0'],{windowsHide:true,shell:false,stdio:['ignore','pipe','pipe']});
 let url='',connected=false,done=false,stopped=false,checking=false,log='',resolve,reject;
 const ready=new Promise((r,j)=>{resolve=r;reject=j;});const timer=setTimeout(()=>fail('No se pudo abrir el acceso por internet. Probá de nuevo.'),60000);
 function fail(message){if(done)return;done=true;clearTimeout(timer);reject(Error(message));child.kill();}
 function feed(data){log=(log+data.toString()).slice(-16000);const m=log.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);if(m)url=m[0];if(log.includes('Registered tunnel connection'))connected=true;if(url&&connected&&!done&&!checking){checking=true;(async()=>{while(!done){try{const r=await fetch(url+'/health',{signal:AbortSignal.timeout(5000)});const body=await r.json();if(r.ok&&body.service==='Forbidden Memories Amigos'&&body.protocol===1){if(!done){done=true;clearTimeout(timer);resolve(url);}return;}}catch{}await new Promise(r=>setTimeout(r,2000));}})().catch(()=>fail('No se pudo verificar el acceso por internet.'));}}
 child.stdout.on('data',feed);child.stderr.on('data',feed);child.on('error',()=>fail('No se pudo abrir el acceso por internet.'));child.on('exit',code=>{clearTimeout(timer);if(!done)fail('El acceso por internet se cerró antes de conectar.');if(!stopped)onExit(code);});
 return {ready,stop(){stopped=true;clearTimeout(timer);if(!done){done=true;reject(Error('Conexión cancelada.'));}child.kill();},get log(){return log;},pid:child.pid};
}
module.exports={startTunnel};
