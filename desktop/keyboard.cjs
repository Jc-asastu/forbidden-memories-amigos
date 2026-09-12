'use strict';
const fs=require('node:fs'),path=require('node:path');
const mapping=require('../shared/keyboard.json');
function keyboardIni(){return '# Forbidden Memories Amigos: QWER / arrow keys / Enter\n\n'+Array.from({length:5},(_,i)=>'[player'+(i+1)+']\n'+Object.entries(mapping).map(([button,key])=>button+' = '+key).join('\n')).join('\n\n')+'\n';}
function ensureKeyboard(exe,directory=path.dirname(exe)){
 fs.mkdirSync(directory,{recursive:true});
 const file=path.join(directory,'keybinds.ini'),marker=path.join(directory,'.amigos-keyboard-qwer-v1');
 if(fs.existsSync(marker)&&fs.existsSync(file))return;
 if(fs.existsSync(file))fs.copyFileSync(file,path.join(directory,'keybinds.before-qwer.ini'));
 fs.writeFileSync(file,keyboardIni());fs.writeFileSync(marker,'1');
}
module.exports={mapping,keyboardIni,ensureKeyboard};
