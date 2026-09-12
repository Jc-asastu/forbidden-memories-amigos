'use strict';
const dgram = require('node:dgram');
// The native game talks UDP only to loopback. The app transports each datagram
// over the existing WebSocket, so guests never need router port forwarding.
async function createBridge({slot, send, onError = () => {}}) {
  const socket = dgram.createSocket('udp4'); let closed = false;
  await new Promise((resolve, reject) => { socket.once('error', reject); socket.bind(0, '127.0.0.1', resolve); });
  const bridgePort = socket.address().port;
  const reservation = dgram.createSocket('udp4');
  await new Promise((resolve, reject) => { reservation.once('error', reject); reservation.bind(0, '127.0.0.1', resolve); });
  const gamePort = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  socket.on('error', onError);
  socket.on('message', (bytes, from) => { if (from.address === '127.0.0.1' && from.port === gamePort && !closed) send(bytes); });
  return {
    gamePort, bridgePort,
    bind: `127.0.0.1:${gamePort}`, peer: slot === 0 ? '' : `127.0.0.1:${bridgePort}`,
    receive(bytes) { if (!closed) socket.send(bytes, gamePort, '127.0.0.1', error => { if (error) onError(error); }); },
    close() { if (!closed) { closed = true; socket.close(); } }
  };
}
module.exports = {createBridge};
