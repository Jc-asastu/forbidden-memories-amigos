'use strict';
const fs=require('node:fs'),path=require('node:path');
const {VERSION}=require('./native-patch.cjs');
const {DISC_SHA1,DISC_SIZE,verifyImage}=require('./setup.cjs');
const EXE='Yu_Gi_Oh_Forbidden_Memories_Recompiled.exe';
function compatible(exe){
 try{return !!exe&&fs.statSync(exe).isFile()&&fs.readFileSync(path.join(path.dirname(exe),'.amigos-runtime-v5'),'utf8').trim()===VERSION&&fs.existsSync(path.join(path.dirname(exe),'disc','SLUS_014.11'));}catch{return false;}
}
function usableDisc(file){try{return !!file&&fs.statSync(file).isFile()&&fs.statSync(file).size===DISC_SIZE;}catch{return false;}}
function ready(settings){return settings.discVerified===DISC_SHA1&&usableDisc(settings.discPath)&&compatible(settings.gameExe);}
function rootsFor(settings,data,installDir){
 return [...new Set([settings.storagePath,data,installDir&&installDir+'-GameData',installDir&&path.join(installDir,'GameData'),settings.discPath&&path.dirname(path.dirname(settings.discPath))].filter(Boolean).map(p=>path.resolve(p)))];
}
function cachedRuntime(root){
 const project=path.join(root,'native-0.5.9','project'),build=path.join(project,'build-release'),exe=path.join(build,EXE);
 try{
  if(fs.readFileSync(path.join(root,'native-0.5.9','.complete'),'utf8').trim()!==VERSION||!fs.existsSync(exe))return '';
  const boot=path.join(build,'disc','SLUS_014.11');
  if(!fs.existsSync(boot)){const source=path.join(project,'disc','SLUS_014.11');if(!fs.existsSync(source))return '';fs.mkdirSync(path.dirname(boot),{recursive:true});fs.copyFileSync(source,boot);}
  fs.writeFileSync(path.join(build,'.amigos-runtime-v5'),VERSION);return exe;
 }catch{return '';}
}
function findRuntime(settings,data,installDir){
 for(const candidate of [settings.gameExe,settings.preparedInstallation?.gameExe])if(compatible(candidate))return candidate;
 for(const root of rootsFor(settings,data,installDir)){
  const built=cachedRuntime(root);if(built)return built;
  try{for(const entry of fs.readdirSync(path.join(root,'runtime'),{withFileTypes:true}).slice(0,100)){if(!entry.isDirectory())continue;const exe=path.join(root,'runtime',entry.name,EXE);if(compatible(exe))return exe;}}catch{}
 }
 return '';
}
async function recoverInstallation(store,{installDir}={}){
 const settings=store.state.settings;
 if(ready(settings))return {ready:true,recovered:false};
 const exe=findRuntime(settings,store.root,installDir);let disc='';
 if(settings.discVerified===DISC_SHA1&&usableDisc(settings.discPath))disc=settings.discPath;
 else{
  const candidates=[settings.preparedInstallation?.discPath,...rootsFor(settings,store.root,installDir).map(p=>path.join(p,'library','Forbidden Memories (USA).bin'))];
  for(const candidate of [...new Set(candidates.filter(Boolean))]){if(!usableDisc(candidate))continue;try{await verifyImage(candidate);disc=candidate;break;}catch{}}
 }
 const values={};if(exe&&exe!==settings.gameExe)values.gameExe=exe;
 if(disc&&(disc!==settings.discPath||settings.discVerified!==DISC_SHA1)){values.discPath=disc;values.discVerified=DISC_SHA1;}
 if(Object.keys(values).length)store.settings(values);
 return {ready:ready(store.state.settings),recovered:!!Object.keys(values).length,hasImage:!!disc};
}
function rememberInstallation(store){if(ready(store.state.settings)){const s=store.state.settings;store.settings({preparedInstallation:{discPath:s.discPath,discVerified:DISC_SHA1,gameExe:s.gameExe,runtimeVersion:VERSION}});}}
function incrementalBuildRoot(settings,data,installDir){
 for(const root of rootsFor(settings,data,installDir)){const work=path.join(root,'native-0.5.9');
  if(fs.existsSync(path.join(work,'project','.unpacked'))&&fs.existsSync(path.join(work,'project','generated'))&&fs.existsSync(path.join(work,'project','build-release',EXE))&&fs.existsSync(path.join(work,'toolchain','bin','cmake.exe'))&&fs.existsSync(path.join(work,'toolchain','python','python.exe')))return root;
 }return '';
}
module.exports={incrementalBuildRoot,compatible,ready,usableDisc,findRuntime,recoverInstallation,rememberInstallation,cachedRuntime};

