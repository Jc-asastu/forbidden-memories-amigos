'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');const {findSave,exportGameCard}=require('./memory-card.cjs');const {updateIntegrity,validIntegrity}=require('./save-codec.cjs');const decks=require('./starter-decks.json');const cardInfo=require('./starter-card-info.json');
function starterList(){return decks.map(d=>({...d,cardList:[...new Set(d.cards)].map(id=>({id,count:d.cards.filter(x=>x===id).length,...cardInfo[id]}))}));}
function createStarterCard(deckId,profile){
 const deck=decks.find(d=>d.id===deckId);if(!deck)throw Error('Elegí uno de los tres mazos iniciales.');
 const card=exportGameCard(fs.readFileSync(path.join(__dirname,'starter-template.mcd')));const save=findSave(card);const data=Buffer.from(save.data.subarray(0x200,0x880));if(!validIntegrity(data))throw Error('La plantilla de mazos iniciales no es válida.');
 deck.cards.forEach((id,i)=>data.writeUInt16LE(id,i*2));data.fill(0,0x50,0x322);for(const id of deck.cards)data[0x4f+id]++;
 // Save offset 0x334 is the original duelist code; 0x408 is play time.
 // Give each local profile a stable identity, including mirror matches.
 const identity=crypto.createHash('sha256').update('fm-amigos-starter-v1:'+profile.id).digest();data.writeUInt32LE((identity.readUInt32LE(0)&0x7fffffff)||1,0x334);
 const name=String(profile.name).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6)||'AMIGO';data.fill(0,0x40c,0x41a);for(let i=0;i<name.length;i++){const c=name.charCodeAt(i);data.writeUInt16LE(c>=65?0x8260+c-65:0x824f+c-48,0x40c+i*2);}
 updateIntegrity(data);data.copy(save.data,0x200);data.copy(save.data,0x880);return card;
}
module.exports={starterList,createStarterCard};
