'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dgram = require('node:dgram');
const {WebSocket} = require('ws');
const {blankCard, findSave, exportGameCard, decodeOnlineCard, cardHash} = require('../shared/memory-card.cjs');
const {LocalStore} = require('../desktop/store.cjs');
const {launchSpec} = require('../desktop/game.cjs');
const {createBridge} = require('../desktop/relay.cjs');
const {startServer, PROTOCOL} = require('../server/index.cjs');
function fixture(seed = 1) {
  const card = blankCard(); const entry = card.subarray(128, 256);
  entry[0] = 0x51; entry.writeUInt32LE(8192, 4); entry.writeUInt16LE(65535, 8); entry.write('BASLUS-01411-YUGIOH', 10, 'ascii');
  entry[127] = entry.subarray(0, 127).reduce((x, b) => x ^ b, 0);
  card.write('SC', 8192, 'ascii');
  for (let i = 0; i < 40; i++) card.writeUInt16LE(seed + i, 8192 + 0x200 + i * 2);
  return card;
}
class Peer {
  constructor(url, name) {
    this.messages = []; this.waiters = []; this.ws = new WebSocket(url);
    this.ws.on('message', (bytes, binary) => {
      const data = binary ? {type: 'binary', bytes} : JSON.parse(bytes.toString());
      const at = this.waiters.findIndex(w => w.type === data.type && w.predicate(data));
      if (at !== -1) { const w = this.waiters.splice(at, 1)[0]; clearTimeout(w.timer); w.resolve(data); } else this.messages.push(data);
    });
    this.open = new Promise((resolve, reject) => { this.ws.once('error', reject); this.ws.once('open', () => { this.send({type: 'hello', name, protocol: PROTOCOL}); this.next('welcome').then(resolve, reject); }); });
  }
  send(data) { this.ws.send(JSON.stringify(data)); }
  next(type, predicate = () => true) {
    const at = this.messages.findIndex(m => m.type === type && predicate(m)); if (at !== -1) return Promise.resolve(this.messages.splice(at, 1)[0]);
    return new Promise((resolve, reject) => { const waiter = {type, predicate, resolve}; waiter.timer = setTimeout(() => { this.waiters = this.waiters.filter(w => w !== waiter); reject(new Error(`Timed out: ${type}`)); }, 2500); this.waiters.push(waiter); });
  }
  clear() { this.messages = []; }
  close() { this.ws.terminate(); for (const w of this.waiters) clearTimeout(w.timer); }
}
test('local profiles persist independently and opening an online session preserves both originals', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-store-')); t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const store = new LocalStore(root); store.create('Juan'); const first = store.state.selected;
  const own = fixture(1); fs.writeFileSync(path.join(store.profileDir(first), 'card1.mcd'), own);
  store.create('Amigo'); const second = store.state.selected;
  const other = fixture(50); fs.writeFileSync(path.join(store.profileDir(second), 'card1.mcd'), other);
  const restored = new LocalStore(root); assert.equal(restored.state.selected, second); assert.equal(restored.snapshot().profiles.every(p => p.hasSave), true);
  restored.select(first); const online = restored.sessionDirectory(123, [own, other]);
  assert.notEqual(online, restored.profileDir(first));
  assert.deepEqual(fs.readFileSync(path.join(online, 'card2.mcd')), other);
  fs.writeFileSync(path.join(online, 'card1.mcd'), fixture(80));
  assert.deepEqual(fs.readFileSync(path.join(restored.profileDir(first), 'card1.mcd')), own);
  assert.deepEqual(fs.readFileSync(path.join(restored.profileDir(second), 'card1.mcd')), other);
  assert.throws(() => restored.create('JUAN'), /ya existe/);
  assert.throws(() => restored.profileDir('../escape'), /Elegí/);
});
test('card sync excludes unrelated private blocks and rejects broken saves', () => {
  const input = fixture(); input.write('UNRELATED PRIVATE SAVE', 3 * 8192);
  const clean = exportGameCard(input); assert.equal(clean.includes(Buffer.from('UNRELATED PRIVATE SAVE')), false); assert.ok(findSave(clean));
  assert.deepEqual(decodeOnlineCard(clean.toString('base64')), clean);
  assert.throws(() => exportGameCard(blankCard()), /Grabar/);
  const broken = Buffer.from(clean); broken[128 + 127] ^= 1; assert.throws(() => exportGameCard(broken), /dañado/);
  assert.throws(() => decodeOnlineCard('bad'), /no válido/);
});
test('launch isolates saves and maps each remote player to their own local controller', () => {
  const spec = launchSpec({exe: 'C:\\Game Folder\\game.exe', disc: 'C:\\My Discs\\disc.bin', saveDir: 'C:\\Saves\\user', name: 'Juan & Amigo', online: {slot: 1, bind: '127.0.0.1:40001', peer: '127.0.0.1:40002', session: 77}});
  assert.equal(spec.options.shell, false); assert.ok(spec.args.includes('C:\\My Discs\\disc.bin')); assert.ok(spec.args.includes('Juan & Amigo') === false);
  assert.equal(spec.options.env.PSX_NET_INPUT_PLAYER, '0'); assert.equal(spec.options.env.PSX_NET_SLOT, '1'); assert.equal(spec.options.env.PSX_NET_MODE, 'delay');
});
test('public room list, private code, capacity and host migration use real sockets', async t => {
  const server = startServer({port: 0, host: '127.0.0.1'}); const address = await server.ready; t.after(() => server.close());
  const url = `ws://127.0.0.1:${address.port}`; const a = new Peer(url, 'Juan'), b = new Peer(url, 'Amigo'), outsider = new Peer(url, 'Tercero');
  t.after(() => [a, b, outsider].forEach(p => p.close())); await Promise.all([a.open, b.open, outsider.open]);
  a.clear(); b.clear(); outsider.clear();
  a.send({type: 'create', name: 'Mesa libre'}); const pub = (await a.next('room')).room;
  assert.equal(pub.private, false); assert.equal(pub.code, undefined); assert.equal((await b.next('rooms')).rooms[0].id, pub.id);
  b.send({type: 'join', id: pub.id}); assert.equal((await b.next('room')).room.players.length, 2);
  outsider.send({type: 'join', id: pub.id}); assert.match((await outsider.next('error')).message, /ocupada/);
  a.send({type: 'leave'}); await a.next('room', m => m.room === null);
  const migrated = await b.next('room', m => m.room?.players.length === 1); assert.equal(migrated.room.hostId, (await b.open).id);
  b.send({type: 'leave'}); await b.next('room', m => m.room === null);
  a.send({type: 'create', name: 'Privada', private: true}); const priv = (await a.next('room', m => m.room?.name === 'Privada')).room;
  assert.equal(priv.code.length, 6); outsider.clear(); outsider.send({type: 'list'}); assert.equal((await outsider.next('rooms', m => m.rooms.length === 0)).rooms.length, 0);
  b.send({type: 'join', id: priv.id}); assert.match((await b.next('error')).message, /código/);
  b.send({type: 'join', code: priv.code.toLowerCase()}); assert.equal((await b.next('room', m => m.room?.id === priv.id)).room.id, priv.id);
});
test('both saved decks synchronize before launch; native UDP traverses the room and returns', async t => {
  const server = startServer({port: 0, host: '127.0.0.1'}); const {port} = await server.ready; t.after(() => server.close());
  const a = new Peer(`ws://127.0.0.1:${port}`, 'Uno'), b = new Peer(`ws://127.0.0.1:${port}`, 'Dos');
  t.after(() => { a.close(); b.close(); }); await Promise.all([a.open, b.open]);
  a.send({type: 'create', name: 'Prueba'}); const room = (await a.next('room')).room; b.send({type: 'join', id: room.id}); await b.next('room');
  const cards = [fixture(1), fixture(20)];
  a.send({type: 'ready', card: cards[0].toString('base64'), build: 'same'}); b.send({type: 'ready', card: cards[1].toString('base64'), build: 'different'});
  await a.next('room', m => m.room?.players.length === 2 && m.room.players.every(p => p.ready));
  a.send({type: 'start'}); assert.match((await a.next('error')).message, /misma versión/);
  a.clear(); b.send({type: 'ready', card: cards[1].toString('base64'), build: 'same'}); await a.next('room', m => m.room?.players.every(p => p.ready));
  a.send({type: 'start'}); const pa = await a.next('prepare'), pb = await b.next('prepare');
  assert.equal(pa.session, pb.session); assert.equal(pa.slot, 0); assert.equal(pb.slot, 1); assert.deepEqual(pa.hashes, cards.map(cardHash));
  a.send({type: 'prepared', session: pa.session}); b.send({type: 'prepared', session: pb.session}); await Promise.all([a.next('launch'), b.next('launch')]);
  const ba = await createBridge({slot: 0, send: bytes => a.ws.send(bytes)}), bb = await createBridge({slot: 1, send: bytes => b.ws.send(bytes)}); t.after(() => { ba.close(); bb.close(); });
  const ga = dgram.createSocket('udp4'), gb = dgram.createSocket('udp4'); t.after(() => { ga.close(); gb.close(); });
  await Promise.all([new Promise(r => ga.bind(ba.gamePort, '127.0.0.1', r)), new Promise(r => gb.bind(bb.gamePort, '127.0.0.1', r))]);
  const datagram = Buffer.from([0, 255, 42, 13, 10]);
  gb.send(datagram, bb.bridgePort, '127.0.0.1'); const forwarded = await a.next('binary'); assert.deepEqual(forwarded.bytes, datagram);
  const received = new Promise(resolve => ga.once('message', (bytes, from) => resolve({bytes, from}))); ba.receive(forwarded.bytes); const packet = await received;
  assert.deepEqual(packet.bytes, datagram); assert.equal(packet.from.port, ba.bridgePort);
  ga.send(Buffer.from('reply'), packet.from.port, packet.from.address); assert.equal((await b.next('binary')).bytes.toString(), 'reply');
  a.clear(); b.send({type: 'leave'}); assert.match((await a.next('match-ended')).reason, /salió/);
});

test('runtime installation avoids protected documents and reuses its completed copy', t => {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'fm-install-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const {installRuntime}=require('../desktop/install.cjs');const {EXE}=require('../desktop/game.cjs');const source=path.join(root,'package');fs.mkdirSync(path.join(source,'runtime'),{recursive:true});fs.writeFileSync(path.join(source,'runtime',EXE),'fixture native bytes');fs.writeFileSync(path.join(source,'runtime','game.toml'),'config');
 const exe=installRuntime(source,path.join(root,'localdata'));assert.ok(exe.startsWith(path.join(root,'localdata')));fs.writeFileSync(path.join(path.dirname(exe),'game.toml'),'personal state');assert.equal(installRuntime(source,path.join(root,'localdata')),exe);assert.equal(fs.readFileSync(path.join(path.dirname(exe),'game.toml'),'utf8'),'personal state');
});

const {starterList,createStarterCard}=require('../shared/starters.cjs');
const {validIntegrity,crc16}=require('../shared/save-codec.cjs');
test('fresh profiles can use all three genuine 40-card decks without altering campaign saves',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'fm-starters-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const store=new LocalStore(root);store.create('Juan');const original=fs.readFileSync(path.join(store.profileDir(store.state.selected),'card1.mcd'));
 assert.equal(store.snapshot().profiles[0].hasSave,false);assert.throws(()=>store.setOnlineDeck('campaign'),/Todavía/);
 for(const deck of starterList()){assert.equal(deck.cards.length,40);assert.ok(deck.cardList.every(c=>c.count<=3));store.setOnlineDeck(deck.id);const card=store.onlineSave(),save=findSave(card).data,data=save.subarray(0x200,0x880);assert.ok(validIntegrity(data));assert.deepEqual(data,save.subarray(0x880,0xf00));assert.deepEqual(Array.from({length:40},(_,i)=>data.readUInt16LE(i*2)),deck.cards);assert.equal(new LocalStore(root).onlineDeck(),deck.id);}
 assert.deepEqual(fs.readFileSync(path.join(store.profileDir(store.state.selected),'card1.mcd')),original);assert.equal(store.snapshot().profiles[0].hasSave,false);
 const a=findSave(createStarterCard('dragon',{id:'a',name:'Juan'})).data,b=findSave(createStarterCard('dragon',{id:'b',name:'Amigo'})).data;assert.notEqual(a.readUInt32LE(0x534),b.readUInt32LE(0x534));assert.equal(a.readUInt16LE(0x60c),0x8269);
});

 test('QWER keyboard migration separates face and shoulder buttons and preserves later custom bindings',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'fm-keys-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const {ensureKeyboard,mapping}=require('../desktop/keyboard.cjs');const exe=path.join(root,'game.exe'),ini=path.join(root,'keybinds.ini');fs.writeFileSync(ini,'old custom controls');ensureKeyboard(exe);const text=fs.readFileSync(ini,'utf8');assert.equal(fs.readFileSync(path.join(root,'keybinds.before-qwer.ini'),'utf8'),'old custom controls');for(const p of [1,2,3,4,5])assert.ok(text.includes('[player'+p+']'));assert.deepEqual([mapping.cross,mapping.square,mapping.circle,mapping.triangle],['Q','W','E','R']);assert.deepEqual([mapping.up,mapping.down,mapping.left,mapping.right],['Up','Down','Left','Right']);assert.equal(mapping.start,'Return');const buttons=['cross','square','circle','triangle','l1','r1','l2','r2','start','select'];assert.equal(new Set(buttons.map(k=>mapping[k])).size,buttons.length);fs.writeFileSync(ini,'later user controls');ensureKeyboard(exe);assert.equal(fs.readFileSync(ini,'utf8'),'later user controls');
 });

 test('setup rejects bad images and preserves an already installed game on checksum failure',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'fm-setup-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const {importImage,DISC_SIZE}=require('../desktop/setup.cjs');const invalid=path.join(root,'bad.bin');fs.writeFileSync(invalid,'bad');await assert.rejects(importImage(invalid,root),/USA compatible/);await assert.rejects(importImage(path.join(root,'missing.bin'),root),/No encontramos/);const cue=path.join(root,'bad.cue');fs.writeFileSync(cue,'FILE "first.bin" BINARY\nFILE "second.bin" BINARY');await assert.rejects(importImage(cue,root),/directamente/);const library=path.join(root,'library');fs.mkdirSync(library);const target=path.join(library,'Forbidden Memories (USA).bin');fs.writeFileSync(target,'previous installation');const fd=fs.openSync(invalid,'w');fs.ftruncateSync(fd,DISC_SIZE);fs.closeSync(fd);await assert.rejects(importImage(invalid,root),/no coincide/);assert.equal(fs.readFileSync(target,'utf8'),'previous installation');assert.deepEqual(fs.readdirSync(library),['Forbidden Memories (USA).bin']);
 });
