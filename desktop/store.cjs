'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const {starterList, createStarterCard} = require('../shared/starters.cjs');
const {blankCard, findSave, exportGameCard, validateCard} = require('../shared/memory-card.cjs');
function writeAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const temporary = `${file}.${randomUUID()}.tmp`;
  const fd = fs.openSync(temporary, 'wx');
  try { fs.writeFileSync(fd, value); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  try { fs.renameSync(temporary, file); } catch (error) { try { fs.unlinkSync(temporary); } catch {} throw error; }
}
class LocalStore {
  constructor(root) {
    this.root = path.resolve(root); fs.mkdirSync(this.root, {recursive: true});
    this.file = path.join(this.root, 'profiles.json');
    this.state = fs.existsSync(this.file) ? JSON.parse(fs.readFileSync(this.file, 'utf8')) : {version: 1, selected: null, profiles: [], settings: {serverUrl: ''}};
    if (this.state.version !== 1 || !Array.isArray(this.state.profiles)) throw new Error('No se pudo leer la lista de usuarios. Tus partidas no se modificaron.');
  }
  save() { writeAtomic(this.file, JSON.stringify(this.state, null, 2)); }
  snapshot() {
    return {...this.state, profiles: this.state.profiles.map(p => {
      let hasSave = false, saveError = '';
      try { hasSave = !!findSave(fs.readFileSync(path.join(this.profileDir(p.id), 'card1.mcd'))); } catch(e) { saveError = e.message; }
      return {...p, hasSave, saveError, onlineDeck: p.onlineDeck || (hasSave ? 'campaign' : 'dragon')};
    })};
  }
  profile(id = this.state.selected) {
    const result = this.state.profiles.find(p => p.id === id);
    if (!result) throw new Error('Elegí tu usuario primero.');
    if (!/^[a-f0-9-]{36}$/.test(result.id)) throw new Error('Identificador de usuario no válido.');
    return result;
  }
  profileDir(id) { return path.join(this.root, 'profiles', this.profile(id).id); }
  create(name) {
    name = String(name || '').trim().normalize('NFC');
    if (!name || [...name].length > 24 || /[\u0000-\u001f\u007f]/.test(name)) throw new Error('Elegí un nombre de entre 1 y 24 caracteres.');
    if (this.state.profiles.some(p => p.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error('Ese usuario ya existe en esta PC.');
    const profile = {id: randomUUID(), name, onlineDeck: 'dragon', createdAt: new Date().toISOString()};
    const dir = path.join(this.root, 'profiles', profile.id); fs.mkdirSync(dir, {recursive: true});
    writeAtomic(path.join(dir, 'card1.mcd'), blankCard()); writeAtomic(path.join(dir, 'card2.mcd'), blankCard());
    this.state.profiles.push(profile); this.state.selected = profile.id; this.save(); return this.snapshot();
  }
  select(id) { this.profile(id); this.state.selected = id; this.save(); return this.snapshot(); }
  settings(values) { this.state.settings = {...this.state.settings, ...values}; this.save(); return this.snapshot(); }
  backup(id = this.state.selected) {
    const dir = this.profileDir(id); const file = path.join(dir, 'card1.mcd'); const bytes = validateCard(fs.readFileSync(file));
    const backups = path.join(dir, 'backups'); fs.mkdirSync(backups, {recursive: true});
    const target = path.join(backups, `${Date.now()}-${randomUUID().slice(0, 8)}.mcd`); writeAtomic(target, bytes); return target;
  }
  importSave(source) {
    const card = exportGameCard(fs.readFileSync(source)); this.backup();
    writeAtomic(path.join(this.profileDir(this.state.selected), 'card1.mcd'), card); return this.snapshot();
  }
  onlineDeck() { const p=this.profile();return p.onlineDeck || (this.snapshot().profiles.find(x=>x.id===p.id)?.hasSave ? 'campaign':'dragon'); }
  setOnlineDeck(id) { if(id!=='campaign'&&!starterList().some(d=>d.id===id))throw Error('Ese mazo no existe.');if(id==='campaign'&&!this.snapshot().profiles.find(p=>p.id===this.state.selected)?.hasSave)throw Error('Todavía no tenés una partida guardada. Podés usar cualquiera de los tres mazos iniciales.');this.profile().onlineDeck=id;this.save();return this.snapshot(); }
  onlineSave() { const id=this.onlineDeck();return id==='campaign'?exportGameCard(fs.readFileSync(path.join(this.profileDir(this.state.selected),'card1.mcd'))):createStarterCard(id,this.profile()); }
  onlineDeckName() { return this.onlineDeck()==='campaign'?'Mazo de campaña':starterList().find(d=>d.id===this.onlineDeck()).name; }
  sessionDirectory(session, cards) {
    if (!Number.isSafeInteger(session) || session < 1 || cards.length !== 2) throw new Error('Sesión no válida.');
    const dir = path.join(this.root, 'sessions', `${session}-${randomUUID()}`); fs.mkdirSync(dir, {recursive: true});
    for (let i = 0; i < 2; i++) writeAtomic(path.join(dir, `card${i + 1}.mcd`), exportGameCard(cards[i]));
    return dir;
  }
}
module.exports = {LocalStore, writeAtomic};
