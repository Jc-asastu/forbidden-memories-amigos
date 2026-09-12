'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const REQUIRED_BYTES=4*1024**3;
function storagePath(settings,data,{packaged=false,exe=process.execPath}={}){
 if(settings.storagePath)return path.resolve(settings.storagePath);
 if(fs.existsSync(path.join(data,'native-0.5.9'))||fs.existsSync(path.join(data,'library'))||settings.gameExe)return data;
 return packaged?path.dirname(exe)+'-GameData':data;
}
function existingAncestor(directory){let p=path.resolve(directory);while(!fs.existsSync(p)){const parent=path.dirname(p);if(parent===p)throw Error('Ese disco no está disponible. Elegí otra carpeta.');p=parent;}return p;}
function spaceInfo(directory,statfs=fs.statfsSync){try{const s=statfs(existingAncestor(directory));return {path:directory,freeBytes:Number(s.bavail)*Number(s.bsize),requiredBytes:REQUIRED_BYTES};}catch{return {path:directory,freeBytes:null,requiredBytes:REQUIRED_BYTES};}}
function checkSpace(directory,required=REQUIRED_BYTES,statfs=fs.statfsSync){const info=spaceInfo(directory,statfs);if(info.freeBytes===null)throw Error('No pudimos comprobar el espacio de '+directory+'. Elegí una carpeta en un disco disponible.');if(info.freeBytes<required)throw Error('Falta espacio en '+directory+'. Hay '+(info.freeBytes/1024**3).toFixed(1)+' GB libres; la preparación necesita '+(required/1024**3).toFixed(1)+' GB. Tocá «Cambiar carpeta / disco» y elegí el disco con espacio.');fs.mkdirSync(directory,{recursive:true});const probe=path.join(directory,'.write-check-'+crypto.randomUUID());try{fs.writeFileSync(probe,'');fs.unlinkSync(probe);}catch{throw Error('No se puede escribir en '+directory+'. Elegí otra carpeta.');}return info;}
function tempEnvironment(work){const temp=path.join(work,'temp');fs.mkdirSync(temp,{recursive:true});return {TEMP:temp,TMP:temp,TMPDIR:temp};}
module.exports={storagePath,spaceInfo,checkSpace,tempEnvironment,REQUIRED_BYTES};
