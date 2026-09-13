'use strict';
// Isolated Electron process; simulate a compiler interruption after a real image import.
const fs=require('node:fs'),path=require('node:path');
if(!process.env.FM_AMIGOS_DATA_DIR)throw Error('Requires isolated data');
const build=require('../desktop/build-runtime.cjs');build.buildRuntime=async()=>{fs.appendFileSync(path.join(process.env.FM_AMIGOS_DATA_DIR,'compiler-attempts'),'1');throw Error('Interrupción simulada del compilador');};
require('../desktop/install.cjs').installRuntime=()=>null;
require('../desktop/main.cjs');

