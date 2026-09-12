'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {EventEmitter}=require('node:events');
const {checkSpace}=require('./storage.cjs');
const REPO='Jc-asastu/forbidden-memories-amigos';
const LATEST='https://api.github.com/repos/'+REPO+'/releases/latest';
function versionParts(v){const m=/^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(v));return m?m.slice(1).map(Number):null;}
function newer(a,b){const x=versionParts(a),y=versionParts(b);if(!x||!y)return false;for(let i=0;i<3;i++){if(x[i]!==y[i])return x[i]>y[i];}return false;}
function releaseAsset(release,current){
 if(release.draft||release.prerelease||!newer(release.tag_name,current))return null;
 const version=release.tag_name.replace(/^v/,'');
 const name='Forbidden-Memories-Amigos-Setup-'+version+'.exe';
 const a=release.assets?.find(x=>x.name===name&&x.state==='uploaded');
 const url='https://github.com/'+REPO+'/releases/download/'+release.tag_name+'/'+name;
 if(!a||a.browser_download_url!==url||!/^sha256:[a-f0-9]{64}$/i.test(a.digest)||!Number.isSafeInteger(a.size)||a.size<2||a.size>1024**3)throw Error('La nueva versión todavía no está lista para descargar. Probá de nuevo más tarde.');
 return {version,name,url,size:a.size,sha256:a.digest.slice(7).toLowerCase()};
}
async function hashFile(file){const h=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(file))h.update(chunk);return h.digest('hex');}
class Updater extends EventEmitter{
 constructor({version,directory,fetcher=fetch,check=checkSpace}){super();this.version=version;this.directory=directory;this.fetcher=fetcher;this.checkSpace=check;this.state={status:'idle',current:version,message:'Buscando novedades…',progress:null};this.asset=null;this.file=null;this.busy=false;}
 set(values){Object.assign(this.state,values);this.emit('change');}
 async check(){
  if(this.busy)return;this.busy=true;this.set({status:'checking',message:'Buscando actualizaciones…',progress:null});
  try{const r=await this.fetcher(LATEST,{headers:{Accept:'application/vnd.github+json','User-Agent':'ForbiddenMemoriesAmigos'},signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Sin conexión');this.asset=releaseAsset(await r.json(),this.version);this.file=null;this.set({status:this.asset?'available':'current',version:this.asset?.version||this.version,message:this.asset?'Hay una nueva versión lista para vos.':'Tenés la última versión.',progress:100});}
  catch(e){this.set({status:'error',message:e.message.includes('nueva versión')?e.message:'No pudimos buscar actualizaciones. Podés jugar la campaña sin conexión.',progress:null});}
  finally{this.busy=false;}
 }
 async download(){
  if(this.busy)return;if(!this.asset)throw Error('Primero buscá una actualización.');this.busy=true;const a=this.asset;let partial;
  try{
   const directory=this.directory();this.checkSpace(directory,a.size+64*1024**2);
   const file=path.join(directory,a.name);partial=file+'.part';
   if(fs.existsSync(file)&&fs.statSync(file).size===a.size&&await hashFile(file)===a.sha256){this.file=file;this.set({status:'downloaded',message:'Actualización verificada. Lista para instalar.',progress:100});return;}
   this.set({status:'downloading',message:'Descargando la actualización…',progress:0});
   const r=await this.fetcher(a.url,{signal:AbortSignal.timeout(30*60*1000)});if(!r.ok||!r.body)throw Error('Se interrumpió la descarga. Volvé a intentar.');
   const fd=fs.openSync(partial,'w');let total=0,last=-1;const hash=crypto.createHash('sha256');
   try{for await(const chunk of r.body){total+=chunk.length;if(total>a.size)throw Error('La descarga no coincide con la versión publicada.');hash.update(chunk);let at=0;while(at<chunk.length)at+=fs.writeSync(fd,chunk,at,chunk.length-at);const progress=Math.floor(total/a.size*100);if(progress!==last){last=progress;this.set({progress,message:'Descargando · '+Math.round(total/1024**2)+' de '+Math.round(a.size/1024**2)+' MB'});}}fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
   if(total!==a.size||hash.digest('hex')!==a.sha256)throw Error('La descarga llegó incompleta. Volvé a intentar; tus partidas están intactas.');
   fs.renameSync(partial,file);this.file=file;this.set({status:'downloaded',message:'Actualización verificada. Lista para instalar.',progress:100});
  }catch(e){this.set({status:'error',message:e.message,progress:null});throw e;}finally{if(partial&&fs.existsSync(partial))fs.unlinkSync(partial);this.busy=false;}
 }
 async verifiedFile(){if(!this.file||!this.asset||!fs.existsSync(this.file)||await hashFile(this.file)!==this.asset.sha256)throw Error('Volvé a descargar la actualización.');return this.file;}
}
module.exports={Updater,releaseAsset,newer,hashFile,LATEST};
