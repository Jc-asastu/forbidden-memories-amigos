'use strict';
const crypto = require('node:crypto');
const SIZE = 128 * 1024;
function checksum(frame) { let value = 0; for (let i = 0; i < 127; i++) value ^= frame[i]; return value; }
function blankCard() {
  const card = Buffer.alloc(SIZE, 255);
  card.fill(0, 0, 128); card.write('MC'); card[127] = checksum(card);
  for (let s = 1; s <= 35; s++) {
    const at = s * 128; card.fill(0, at, at + 128);
    if (s <= 15) card[at] = 0xa0;
    else card.fill(255, at, at + 4);
    card[at + 8] = card[at + 9] = 255;
    card[at + 127] = checksum(card.subarray(at, at + 128));
  }
  card.fill(0, 36 * 128, 63 * 128); card.copy(card, 63 * 128, 0, 128);
  return card;
}
function validateCard(card) {
  if (!Buffer.isBuffer(card) || card.length !== SIZE || card.toString('ascii', 0, 2) !== 'MC') throw new Error('El archivo no es un guardado válido de PS1.');
  if (card[127] !== checksum(card.subarray(0, 128))) throw new Error('La cabecera del guardado está dañada.');
  return card;
}
function findSave(card) {
  validateCard(card);
  for (let block = 1; block <= 15; block++) {
    const entry = card.subarray(block * 128, (block + 1) * 128);
    const name = entry.subarray(10, 30).toString('ascii').split('\0')[0];
    if (entry[0] !== 0x51 || name !== 'BASLUS-01411-YUGIOH') continue;
    if (entry[127] !== checksum(entry) || entry.readUInt32LE(4) !== 8192 || entry.readUInt16LE(8) !== 65535) throw new Error('El guardado de Forbidden Memories está dañado o usa un formato no compatible.');
    const data = card.subarray(block * 8192, (block + 1) * 8192);
    if (data.toString('ascii', 0, 2) !== 'SC') throw new Error('El bloque de partida no tiene una cabecera válida.');
    return {block, entry, data};
  }
  return null;
}
// Only the game's single save block travels online, never unrelated saves on an imported card.
function exportGameCard(card) {
  const save = findSave(card);
  if (!save) throw new Error('Primero jugá la campaña y usá «Grabar» para crear tu partida.');
  const result = blankCard(); save.entry.copy(result, 128); save.data.copy(result, 8192);
  return result;
}
function cardHash(card) { return crypto.createHash('sha256').update(card).digest('hex'); }
function decodeOnlineCard(text) {
  if (typeof text !== 'string' || text.length !== Math.ceil(SIZE / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(text)) throw new Error('Guardado recibido no válido.');
  return exportGameCard(Buffer.from(text, 'base64'));
}
module.exports = {SIZE, blankCard, validateCard, findSave, exportGameCard, cardHash, decodeOnlineCard};
