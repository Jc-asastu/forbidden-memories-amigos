'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const verified=new Map();
function prepareDisc(disc,directory){
 if(!['.bin','.img'].includes(path.extname(disc).toLowerCase()))return disc;
 const stat=fs.statSync(disc),key=disc+'|'+stat.size+'|'+stat.mtimeMs;
 if(!verified.has(key)){
  if(stat.size!==517872768)throw new Error('Esta primera versión necesita el disco USA original compatible.');
  const hash=crypto.createHash('sha1'),buffer=Buffer.alloc(1024*1024),fd=fs.openSync(disc,'r');
  try{let n;while((n=fs.readSync(fd,buffer,0,buffer.length,null))>0)hash.update(buffer.subarray(0,n));}finally{fs.closeSync(fd);}
  if(hash.digest('hex')!=='d5785a41900a10968d4a28a390666c4b9879b796')throw new Error('El disco no coincide con la versión USA compatible con este juego.');
  verified.set(key,true);
 }
 const cue=path.join(directory,'disc.cue');
 fs.writeFileSync(cue,'FILE "'+path.resolve(disc).replaceAll('\\','/')+'" BINARY\n  TRACK 01 MODE2/2352\n    INDEX 01 00:00:00\n');
 return cue;
}
module.exports={prepareDisc};
