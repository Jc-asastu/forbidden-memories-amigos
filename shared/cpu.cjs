'use strict';
const {exportGameCard,findSave}=require('./memory-card.cjs'),{updateIntegrity}=require('./save-codec.cjs'),decks=require('./starter-decks.json');
const DIFFICULTIES=[
 {id:'easy',name:'Fácil',description:'Busca jugadas simples y fusiones cortas.',ai:[5,20,20,1,1,0,0,25,50]},
 {id:'medium',name:'Medio',description:'Evalúa más combinaciones y fusiones.',ai:[5,20,10,2,2,0,0,25,50]},
 {id:'hard',name:'Difícil',description:'Explora más combinaciones y fusiones profundas.',ai:[5,20,5,3,3,0,0,25,50]}
];
function difficulty(id){const d=DIFFICULTIES.find(d=>d.id===id);if(!d)throw Error('Elegí Fácil, Medio o Difícil.');return d;}
function practiceCard(source){
 const card=exportGameCard(source),save=findSave(card),data=Buffer.from(save.data.subarray(0x200,0x880));
 // Original save: 801D0200 base, Free Duel unlock mask at 801D06F4, MSB first.
 // This disposable copy exposes only Simon (id 1). Never write the campaign card.
 data.fill(0,0x4f4,0x4f9);data[0x4f4]=0x40;updateIntegrity(data);data.copy(save.data,0x200);data.copy(save.data,0x880);return card;
}
function cpuConfig(id){
 const d=difficulty(id),cards=decks.find(d=>d.id==='dragon').cards,counts=new Map();for(const c of cards)counts.set(c,(counts.get(c)||0)+1);
 const entries=[...counts].sort((a,b)=>a[0]-b[0]);let total=0;const weights=entries.map(([card,n])=>{const w=Math.floor(n*2048/40);total+=w;return [card,w]});for(let i=0;total<2048;i++,total++)weights[i%weights.length][1]++;
 return '[Simon Muran]\nname = CPU '+({easy:'FACIL',medium:'MEDIO',hard:'DIFICIL'}[id])+'\nai = '+d.ai.join(', ')+'\n'+weights.map(([c,w])=>c+' = '+w).join('\n')+'\n';
}
module.exports={DIFFICULTIES,difficulty,practiceCard,cpuConfig};

