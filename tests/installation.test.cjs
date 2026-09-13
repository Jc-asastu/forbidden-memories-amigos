'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{test}=require('node:test');
const {LocalStore}=require('../desktop/store.cjs'),{recoverInstallation,findRuntime}=require('../desktop/installation.cjs'),{VERSION}=require('../desktop/native-patch.cjs'),{DISC_SIZE,DISC_SHA1}=require('../desktop/setup.cjs'),{buildRuntime}=require('../desktop/build-runtime.cjs');
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'fm-recovery-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const s=new LocalStore(root);s.create('Juan');return {root,s};}
function game(root,sub='runtime/working'){const dir=path.join(root,sub);fs.mkdirSync(path.join(dir,'disc'),{recursive:true});const exe=path.join(dir,'Yu_Gi_Oh_Forbidden_Memories_Recompiled.exe');fs.writeFileSync(exe,'native fixture');fs.writeFileSync(path.join(dir,'disc','SLUS_014.11'),'boot');fs.writeFileSync(path.join(dir,'.amigos-runtime-v5'),VERSION);return exe;}
function disc(root){const p=path.join(root,'library','Forbidden Memories (USA).bin');fs.mkdirSync(path.dirname(p),{recursive:true});const fd=fs.openSync(p,'w');fs.ftruncateSync(fd,DISC_SIZE);fs.closeSync(fd);return p;}
test('a ready installation survives repeated reopen without changing config or invoking preparation',async t=>{
 const {root,s}=fixture(t);s.settings({discPath:disc(root),discVerified:DISC_SHA1,gameExe:game(root),storagePath:path.join(root,'empty-other-volume')});const original=fs.readFileSync(s.file);
 for(let i=0;i<3;i++){const reopened=new LocalStore(root);assert.deepEqual(await recoverInstallation(reopened),{ready:true,recovered:false});assert.deepEqual(fs.readFileSync(s.file),original);}
 assert(!fs.existsSync(s.state.settings.storagePath));
});
test('stale executable location recovers a previously prepared engine without copying the disc',async t=>{
 const {root,s}=fixture(t),exe=game(root);s.settings({discPath:disc(root),discVerified:DISC_SHA1,gameExe:path.join(root,'missing.exe')});const result=await recoverInstallation(s);assert(result.ready);assert(result.recovered);assert.equal(s.state.settings.gameExe,exe);assert.equal(new LocalStore(root).state.settings.gameExe,exe);
});
test('completed compiler cache restores missing readiness marker without toolchain or build',async t=>{
 const {root,s}=fixture(t),exe=game(root,'native-0.5.9/project/build-release'),dir=path.dirname(exe);
 fs.unlinkSync(path.join(dir,'.amigos-runtime-v5'));fs.writeFileSync(path.join(root,'native-0.5.9','.complete'),VERSION);
 assert.equal(findRuntime({},root),exe);assert.equal(fs.readFileSync(path.join(dir,'.amigos-runtime-v5'),'utf8'),VERSION);
 fs.unlinkSync(path.join(dir,'.amigos-runtime-v5'));
 assert.equal(await buildRuntime('no-bootstrap-files',root,'unused'),exe);
 assert.equal(fs.readFileSync(path.join(dir,'.amigos-runtime-v5'),'utf8'),VERSION);assert(!fs.existsSync(path.join(root,'native-0.5.9','toolchain')));
});
test('an interrupted build retains its imported image and does not start preparation during reopen',async t=>{
 const {root,s}=fixture(t),image=disc(root);s.settings({discPath:image,discVerified:DISC_SHA1,setupSource:image});const original=fs.readFileSync(s.file);
 const reopened=new LocalStore(root),result=await recoverInstallation(reopened);assert(!result.ready);assert(result.hasImage);assert.deepEqual(fs.readFileSync(s.file),original);assert(!fs.existsSync(path.join(root,'native-0.5.9')));
});

