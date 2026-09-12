'use strict';
// Original USA save integrity: guest routines 8003CE74, 8003CEB8, 8003CF14, 8003CFC8.
function crc16(bytes){let crc=0;for(const b of bytes){crc^=b<<8;for(let i=0;i<8;i++)crc=((crc<<1)^((crc&0x8000)?0x1021:0))&65535;}return crc;}
function integrityRegion(data,start,length,checksumAt,wordsEnd,wordCount){
 const crc=crc16(data.subarray(start,start+length));data.writeUInt16LE(crc,checksumAt);data.writeUInt16LE(crc,checksumAt+2);
 let a=(crc|(crc<<16))>>>0,b=a;
 for(let i=0;i<wordCount;i++){let next=(((b<<31)>>>0)|(a>>>1))>>>0;next=(next^(a<<12))>>>0;b=(b+b+(a&1))>>>0;next=(next^(next>>>20))>>>0;a=next;data.writeUInt32LE(next,wordsEnd-i*4);}
}
function updateIntegrity(data){if(data.length!==0x680)throw Error('Invalid save size');integrityRegion(data,0,0x340,0x37c,0x378,15);integrityRegion(data,0x380,0x6c,0x3fc,0x3f8,4);integrityRegion(data,0x400,0x204,0x604,0x624,8);data.fill(0,0x628,0x680);return data;}
function validIntegrity(data){if(data.length!==0x680)return false;return updateIntegrity(Buffer.from(data)).equals(data);}
module.exports={crc16,updateIntegrity,validIntegrity};
