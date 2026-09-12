'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {EXE}=require('./game.cjs');
function installRuntime(root,data){
 const source=process.resourcesPath && fs.existsSync(path.join(process.resourcesPath,'runtime',EXE)) ? path.join(process.resourcesPath,'runtime') : path.join(root,'runtime'); if(!fs.existsSync(path.join(source,EXE)))return null;
 const digest=crypto.createHash('sha256').update(fs.readFileSync(path.join(source,EXE))).digest('hex');
 const dest=path.join(data,'runtime',digest.slice(0,16));
 if(!fs.existsSync(path.join(dest,'.complete'))){fs.mkdirSync(dest,{recursive:true});fs.cpSync(source,dest,{recursive:true});fs.writeFileSync(path.join(dest,'.complete'),digest);}
 return path.join(dest,EXE);
}
module.exports={installRuntime};
