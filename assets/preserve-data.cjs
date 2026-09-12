'use strict';
// Standalone: also runs with the installed Electron's Node mode before NSIS removes the old app.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function inside(base,target){const r=path.relative(path.resolve(base),path.resolve(target));return !!r&&!r.startsWith('..'+path.sep)&&r!=='..'&&!path.isAbsolute(r);}
function atomic(file,bytes){const tmp=file+'.'+crypto.randomUUID()+'.tmp';fs.writeFileSync(tmp,bytes);try{fs.renameSync(tmp,file);}catch(e){fs.unlinkSync(tmp);throw e;}}
function preserve(installDir,data){
 installDir=path.resolve(installDir);data=path.resolve(data);if(inside(installDir,data)||data===installDir)throw Error('Los perfiles deben estar fuera de la carpeta del programa.');
 const file=path.join(data,'profiles.json');if(!fs.existsSync(file))return null;
 const original=fs.readFileSync(file);const state=JSON.parse(original);if(state.version!==1||!Array.isArray(state.profiles))throw Error('No se pudieron leer los perfiles; se canceló la actualización.');
 const backup=path.join(data,'backups','updates',new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomUUID().slice(0,8));
 fs.mkdirSync(backup,{recursive:true});fs.writeFileSync(path.join(backup,'profiles.json'),original);
 if(fs.existsSync(path.join(data,'profiles')))fs.cpSync(path.join(data,'profiles'),path.join(backup,'profiles'),{recursive:true});
 const roots=new Set();const settings=state.settings||{};
 if(fs.existsSync(path.join(installDir,'GameData')))roots.add('GameData');
 for(const key of ['storagePath','discPath','gameExe','setupSource']){
  const value=settings[key];if(!value||!inside(installDir,value))continue;
  const part=path.relative(installDir,path.resolve(value)).split(path.sep)[0];
  if(['resources','locales','assets'].includes(part.toLowerCase())||part.toLowerCase()==='forbidden memories amigos.exe')throw Error('La imagen está dentro de los archivos del programa. Movela a una carpeta propia antes de actualizar.');
  roots.add(part);
 }
 const moves=[];
 try{
  for(const part of roots){const from=path.join(installDir,part);if(!fs.existsSync(from))continue;
   let to=installDir+'-'+part;if(fs.existsSync(to))to+='-'+crypto.randomUUID().slice(0,8);
   if(!inside(installDir,from)||inside(installDir,to)||!inside(path.dirname(installDir),to))throw Error('Ruta de migración no válida.');
   fs.renameSync(from,to);moves.push({from,to});
   for(const key of ['storagePath','discPath','gameExe','setupSource']){const value=settings[key];if(value&&(path.resolve(value)===from||inside(from,value)))settings[key]=path.join(to,path.relative(from,path.resolve(value)));}
   if(part==='GameData'&&!settings.storagePath)settings.storagePath=to;
  }
  if(moves.length){state.settings=settings;atomic(file,JSON.stringify(state,null,2));}
 }catch(e){for(const {from,to} of moves.reverse()){if(!fs.existsSync(from)&&fs.existsSync(to))fs.renameSync(to,from);}throw e;}
 fs.writeFileSync(path.join(backup,'migration.json'),JSON.stringify({installDir,moves},null,2));
 return backup;
}
if(require.main===module){try{console.log(preserve(process.argv[2],process.argv[3])||'No profiles to migrate');}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={preserve,inside};

