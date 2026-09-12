'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {LocalStore}=require('../desktop/store.cjs');
const {preserve}=require('../assets/preserve-data.cjs');
const {Updater,releaseAsset,newer,hashFile}=require('../desktop/updater.cjs');
const {createStarterCard}=require('../shared/starters.cjs');
function temp(t){const p=fs.mkdtempSync(path.join(os.tmpdir(),'fm-launcher-'));t.after(()=>fs.rmSync(p,{force:true,recursive:true}));return p;}
const bytes=Buffer.from('MZverified-test-installer');
function release(content=bytes){return {tag_name:'v0.7.1',draft:false,prerelease:false,assets:[{name:'Forbidden-Memories-Amigos-Setup-0.7.1.exe',state:'uploaded',browser_download_url:'https://github.com/Jc-asastu/forbidden-memories-amigos/releases/download/v0.7.1/Forbidden-Memories-Amigos-Setup-0.7.1.exe',size:content.length,digest:'sha256:'+crypto.createHash('sha256').update(content).digest('hex')}]};}
test('login reuses names after restart and isolates new user saves',t=>{
 const root=temp(t),s=new LocalStore(root);s.login('Juan');const id=s.state.selected,dir=s.profileDir(id),card=createStarterCard('dragon',s.profile());fs.writeFileSync(path.join(dir,'card1.mcd'),card);s.settings({discPath:'D:/My game/library/game.bin',gameExe:'D:/My game/runtime/game.exe',video:{scale:4}});
 s.login('Amigo');assert.notEqual(s.state.selected,id);const reopened=new LocalStore(root);assert.equal(reopened.profile().name,'Amigo');reopened.login(' JUAN ');assert.equal(reopened.state.selected,id);assert.equal(reopened.state.profiles.length,2);assert.deepEqual(fs.readFileSync(path.join(dir,'card1.mcd')),card);assert.equal(reopened.state.settings.video.scale,4);assert.equal(reopened.state.settings.discPath,'D:/My game/library/game.bin');
});
test('installer migration preserves complete game folder and saves across replacement, repeat, and cancel',t=>{
 const root=temp(t),install=path.join(root,'D disk','Amigos'),data=path.join(root,'C profile'),s=new LocalStore(data);s.create('Juan');
 const gd=path.join(install,'GameData'),disc=path.join(gd,'library','game.bin'),exe=path.join(gd,'runtime','game.exe');fs.mkdirSync(path.dirname(disc),{recursive:true});fs.mkdirSync(path.dirname(exe),{recursive:true});fs.writeFileSync(disc,'owned disc');fs.writeFileSync(exe,'runtime');
 s.settings({discPath:disc,gameExe:exe,onboardingDone:true,discVerified:'verified'});const profile=s.state.selected,save=fs.readFileSync(path.join(s.profileDir(profile),'card1.mcd'));
 const backup=preserve(install,data),reopen=new LocalStore(data);assert(fs.existsSync(path.join(backup,'profiles',profile,'card1.mcd')));assert.equal(reopen.state.selected,profile);assert.equal(fs.readFileSync(reopen.state.settings.discPath,'utf8'),'owned disc');assert.equal(reopen.state.settings.storagePath,install+'-GameData');
 fs.rmSync(install,{recursive:true});fs.mkdirSync(install);preserve(install,data);assert(fs.existsSync(reopen.state.settings.gameExe));assert.deepEqual(fs.readFileSync(path.join(reopen.profileDir(profile),'card1.mcd')),save);
});
test('migration retains an existing destination and external image without overwriting either',t=>{
 const root=temp(t),install=path.join(root,'app'),data=path.join(root,'user'),s=new LocalStore(data);s.create('Friend');fs.mkdirSync(path.join(install,'GameData'),{recursive:true});fs.writeFileSync(path.join(install,'GameData','a'),'new');fs.mkdirSync(install+'-GameData');fs.writeFileSync(install+'-GameData/a','old');s.settings({storagePath:path.join(install,'GameData'),discPath:'D:/elsewhere/game.bin'});preserve(install,data);const reopen=new LocalStore(data);assert.equal(fs.readFileSync(install+'-GameData/a','utf8'),'old');assert.equal(fs.readFileSync(path.join(reopen.state.settings.storagePath,'a'),'utf8'),'new');assert.equal(reopen.state.settings.discPath,'D:/elsewhere/game.bin');
});
test('update only selects newer stable releases and rejects substituted downloads or absent digest',()=>{
 assert(newer('0.7.10','0.7.9'));assert(!newer('0.7.1-beta','0.7.0'));assert.equal(releaseAsset(release(),'0.7.1'),null);assert.equal(releaseAsset({...release(),prerelease:true},'0.7.0'),null);
 const r=release();r.assets[0].browser_download_url='https://example.com/evil.exe';assert.throws(()=>releaseAsset(r,'0.7.0'));r.assets[0].browser_download_url=release().assets[0].browser_download_url;r.assets[0].digest=null;assert.throws(()=>releaseAsset(r,'0.7.0'));
});
test('download reports progress, verifies checksum, reuses cache, and detects later tampering',async t=>{
 const root=temp(t);let calls=0;const u=new Updater({version:'0.7.0',directory:()=>root,fetcher:async url=>{calls++;return url.includes('/api.')||url.includes('api.github')?{ok:true,json:async()=>release()}:{ok:true,body:(async function*(){yield bytes.subarray(0,3);yield bytes.subarray(3);})()};}});
 const progress=[];u.on('change',()=>progress.push(u.state.progress));await u.check();assert.equal(u.state.status,'available');await u.download();assert.equal(u.state.status,'downloaded');assert(progress.some(p=>p>0&&p<100));const file=await u.verifiedFile();assert.equal(await hashFile(file),release().assets[0].digest.slice(7));await u.download();assert.equal(calls,2);fs.writeFileSync(file,'tampered');await assert.rejects(()=>u.verifiedFile());
});
test('offline, corrupt download, and full disk remain recoverable without touching a profile',async t=>{
 const root=temp(t),s=new LocalStore(root);s.create('Friend');const original=fs.readFileSync(s.file);
 const u=new Updater({version:'0.7.0',directory:()=>path.join(root,'updates'),fetcher:async()=>{throw Error('offline');}});await u.check();assert.equal(u.state.status,'error');
 u.asset=releaseAsset(release(),'0.7.0');u.fetcher=async()=>({ok:true,body:(async function*(){yield Buffer.alloc(bytes.length);})()});await assert.rejects(()=>u.download(),/incompleta/);assert.equal(fs.readdirSync(path.join(root,'updates')).length,0);
 u.checkSpace=()=>{throw Error('Falta espacio');};await assert.rejects(()=>u.download(),/Falta espacio/);assert.deepEqual(fs.readFileSync(s.file),original);
});

