const {test}=require('node:test'),assert=require('node:assert/strict');const {classify}=require('../desktop/direct-duel.cjs');
test('boot classifier separates title, menu, card confirmation, initialized rules and duel',()=>{const b=Buffer.alloc(64);b.writeUInt32LE(0x800f0af8,0);b[9]=1;assert.equal(classify(b,0),'title');b[7]=128;assert.equal(classify(b,0),'menu');b[4]=2;b[13]=1;assert.equal(classify(b,0),'cards');b[6]=1;assert.equal(classify(b,0),'loading');b.writeUInt32LE(0,0);b.writeUInt32LE(0x800f0548,16);assert.equal(classify(b,0),'rules');assert.equal(classify(b,0xc3),'duel-loading');assert.equal(classify(Buffer.alloc(64),0),'loading');});

const {prepareDirectDuel, handReady, query} = require('../desktop/direct-duel.cjs');
const net = require('node:net');

// Model the observed RAM screens; deliberately drop button presses and delay loads.
// No native executable, ROM or window is opened by these tests.
function model({initial='title', stuck=false, side=0}={}) {
  let time=0, screen=initial, row=0, due=0, pending='', duelAt=0, calls=0, ruleRow=2, cardMode=1, pendingMode=0;
  const inputs=[], attempts=new Map();
  function advance(){if(pending&&time>=due){screen=pending;pending='';if(screen==='duel-loading')duelAt=time;}}
  function transition(next){pending=next;due=time+650;screen='loading';}
  const q=async m=>{
    advance();
    if(m.cmd==='frame'){if(++calls<3)throw Error('Engine starting');return {ok:true};}
    if(m.cmd==='set_input'){
      const buttons=parseInt(m.buttons,16);inputs.push({screen,buttons,time});
      if(buttons===65535)return {ok:true};
      assert.notEqual(screen,'duel-loading','No automatic button after reaching duel');
      const key=screen+':'+(screen==='rules'?ruleRow:row)+':'+buttons,n=(attempts.get(key)||0)+1;attempts.set(key,n);
      if(stuck||n===1)return {ok:true}; // emulate a press ignored during animation
      if(screen==='title'&&buttons===(65535^8))transition('menu');
      else if(screen==='menu'&&buttons===(65535^64))row++;
      else if(screen==='menu'&&buttons===(65535^16))row--;
      else if(screen==='menu'&&row===2&&buttons===(65535^0x4000))transition('cards');
      else if(screen==='cards'&&buttons===(65535^0x4000))transition('rules');
      else if(screen==='rules'&&buttons===(65535^16)){ruleRow=1;pendingMode=1;}
      else if(screen==='rules'&&ruleRow===0&&buttons===(65535^32)){ruleRow=1;pendingMode=1;}
      else if(screen==='rules'&&buttons===(65535^8)){assert.equal(pendingMode,1,'Cannot start with numbered cards');cardMode=pendingMode;transition('duel-loading');}
      else assert.fail('Unexpected menu input '+key);
      return {ok:true};
    }
    assert.equal(m.cmd,'read_ram');const b=Buffer.alloc(m.len);
    if(m.addr==='8009B26C')b[0]=screen==='duel-loading'?0xc3:0;
    if(m.addr==='80184590'){
      if(['title','menu','cards'].includes(screen)){b.writeUInt32LE(0x800f0af8);b[4]=row;if(screen==='title')b[9]=1;else b[7]=128;if(screen==='cards')b[13]=1;}
      if(screen==='rules'){b[4]=2;b[6]=1;b[7]=128;b.writeUInt32LE(0x800f0548,16);b[44]=ruleRow;b[46]=pendingMode;}
    }
    if(m.addr==='8009B230')b[0]=cardMode;
    if(m.addr==='8009B1D5')b[0]=side;
    if(m.addr==='800EA004'&&time-duelAt>=300){b.writeUInt16LE(8000);b.writeUInt16LE(8000,32);}
    if(m.addr===(0x801A7AD8+side*15*28).toString(16).toUpperCase())for(let i=0;i<(time-duelAt>=1000?5:3);i++)b.writeUInt16LE(0x8000,i*28+22);
    return {ok:true,hex:b.toString('hex')};
  };
  return {query:q,sleep:async ms=>{time+=ms;advance();},now:()=>time,inputs,attempts};
}

test('host retries ignored inputs only on their screen and waits for the full hand',async()=>{
  const m=model(),stages=[];const result=await prepareDirectDuel({slot:0,timeout:30000,onStage:s=>stages.push(s)},m);
  assert.equal(result.firstTurn,true);assert(stages.at(-1).includes('otro duelista'));
  assert(m.inputs.filter(i=>i.screen==='rules'&&i.buttons!==65535).length>=2);
  assert.equal(m.inputs.at(-1).buttons,65535);assert(m.now()<30000);
});

test('guest waits with neutral input and never navigates the shared menus',async()=>{
  const m=model({initial:'duel-loading'});await prepareDirectDuel({slot:1,timeout:10000},m);
  assert(m.inputs.length>=2);assert(m.inputs.every(i=>i.buttons===65535));assert(m.now()>=1000);
});

test('stalled boot times out without releasing human controls',async()=>{
  const m=model({stuck:true});await assert.rejects(prepareDirectDuel({slot:0,timeout:4000},m),/primer turno/);
  assert(m.inputs.every(i=>i.screen==='title'));assert.equal(m.inputs.at(-1).buttons,65535);
});

test('cancelled loading sends no input, and invalid slots cannot drive menus',async()=>{
  const abort=new AbortController();abort.abort();const m=model();
  await assert.rejects(prepareDirectDuel({slot:0,signal:abort.signal},m),/cancelada/);assert.equal(m.inputs.length,0);
  await assert.rejects(prepareDirectDuel({slot:2},m),/no válido/);
});

test('incomplete RAM responses cannot be mistaken for a loaded hand',async()=>{
  await assert.rejects(handReady(async()=>({ok:true,hex:''})),/incompleta/);
});

test('local control transport handles fragmented replies and closed connections',async t=>{
  const sockets=new Set();let count=0;
  const server=net.createServer(s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));s.once('data',()=>{
    if(++count===1){s.write('{"ok":');setImmediate(()=>s.end('true,"frame":42}\n'));}else s.end();
  });});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{for(const s of sockets)s.destroy();await new Promise(resolve=>server.close(resolve));});
  const port=server.address().port;assert.equal((await query(port,{cmd:'frame'})).frame,42);
  await assert.rejects(query(port,{cmd:'frame'}),/cerró la conexión/);
});

test('first hand detection also works when player 2 begins',async()=>{const m=model({initial:'duel-loading',side:1});await prepareDirectDuel({slot:1,timeout:10000},m);assert(m.inputs.every(i=>i.buttons===65535));});
