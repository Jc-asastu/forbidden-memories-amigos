'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Transform}=require('node:stream');const {pipeline}=require('node:stream/promises');
const DISC_SIZE=517872768,DISC_SHA1='d5785a41900a10968d4a28a390666c4b9879b796';
async function resolveImage(file){
 const ext=path.extname(file).toLowerCase();
 if(ext==='.cue'){
  const stat=await fs.promises.stat(file);if(stat.size>65536)throw Error('Ese archivo CUE no es válido. Elegí el archivo BIN del juego.');
  const cue=await fs.promises.readFile(file,'utf8');const files=[...cue.matchAll(/^\s*FILE\s+(?:"([^"]+)"|(\S+))\s+BINARY\s*$/gmi)];
  if(files.length!==1)throw Error('Elegí directamente el archivo BIN de Forbidden Memories USA.');
  file=path.resolve(path.dirname(file),files[0][1]||files[0][2]);
 }
 if(!['.bin','.img'].includes(path.extname(file).toLowerCase()))throw Error('Elegí la imagen del disco (.bin) o su archivo .cue. Una foto o un ZIP no son la imagen del juego.');
 const stat=await fs.promises.stat(file);if(!stat.isFile()||stat.size!==DISC_SIZE)throw Error('Este archivo no corresponde al disco USA compatible. Elegí Yu-Gi-Oh! Forbidden Memories (USA).bin.');
 return file;
}
async function importImage(file,root,onProgress=()=>{}){
 let source;try{source=await resolveImage(file);}catch(e){if(e.code==='ENOENT')throw Error('No encontramos el archivo del juego. Volvé a agregarlo con el botón +.');throw e;}
 const directory=path.join(root,'library');await fs.promises.mkdir(directory,{recursive:true});const target=path.join(directory,'Forbidden Memories (USA).bin'),temporary=path.join(directory,crypto.randomUUID()+'.importing');
 const hash=crypto.createHash('sha1');let received=0,last=-1;onProgress({stage:'Comprobando y guardando tu juego…',progress:0});
 try{
  await pipeline(fs.createReadStream(source),new Transform({transform(chunk,encoding,callback){hash.update(chunk);received+=chunk.length;const progress=Math.min(99,Math.floor(received/DISC_SIZE*100));if(progress!==last){last=progress;onProgress({stage:'Comprobando y guardando tu juego…',progress});}callback(null,chunk);}}),fs.createWriteStream(temporary,{flags:'wx'}));
  if(received!==DISC_SIZE||hash.digest('hex')!==DISC_SHA1)throw Error('El archivo no coincide con la versión USA compatible. No se modificó tu instalación anterior.');
  await fs.promises.rename(temporary,target);onProgress({stage:'Juego listo',progress:100});return {discPath:target,discVerified:DISC_SHA1};
 }catch(e){await fs.promises.rm(temporary,{force:true}).catch(()=>{});if(e.code==='ENOSPC')throw Error('El disco elegido se quedó sin espacio al copiar el juego. Tocá «Cambiar carpeta / disco» y reintentá en otro disco.');throw e;}
}
function setupStatus(store,runner,job){const me=store.state.profiles.find(p=>p.id===store.state.selected),s=store.state.settings;const gameReady=s.discVerified===DISC_SHA1&&!!s.discPath&&fs.existsSync(s.discPath)&&!!runner.paths().exe&&fs.existsSync(path.join(path.dirname(runner.paths().exe),'.amigos-runtime-v5'));return {...job,hasProfile:!!me,gameReady,ready:!!me&&gameReady&&!job.busy};}
module.exports={importImage,resolveImage,setupStatus,DISC_SIZE,DISC_SHA1};
