const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { WebSocket, WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const rooms = new Map();
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.mp3': 'audio/mpeg'
};

const server = http.createServer((request, response) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  } catch {
    response.writeHead(400).end('Solicitud inválida');
    return;
  }

  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^[/\\]+/, '');
  const filePath = path.resolve(ROOT, relativePath);
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
    response.writeHead(403).end('Acceso denegado');
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(404).end('No encontrado');
      return;
    }
    response.writeHead(200, {
      'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff'
    });
    response.end(content);
  });
});

const webSocketServer = new WebSocketServer({ server });

function enviar(socket, mensaje) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(mensaje));
  }
}

function error(socket, mensaje) {
  enviar(socket, { type: 'error', message: mensaje });
}

function salaDe(socket) {
  return socket.roomCode ? rooms.get(socket.roomCode) : null;
}

function liberarSala(socket) {
  const room = salaDe(socket);
  if (!room) return;

  room.players.delete(socket);
  socket.roomCode = null;
  if (room.players.size === 0) {
    rooms.delete(room.code);
    return;
  }

  for (const player of room.players.keys()) {
    enviar(player, { type: 'opponent_disconnected' });
  }
  rooms.delete(room.code);
}

function crearSala(socket) {
  if (socket.roomCode) {
    error(socket, 'Ya estás en una sala.');
    return;
  }

  let code;
  do {
    code = randomBytes(2).toString('hex').toUpperCase();
  } while (rooms.has(code));

  const room = { code, turn: 1, players: new Map([[socket, 1]]) };
  rooms.set(code, room);
  socket.roomCode = code;
  socket.side = 1;
  enviar(socket, { type: 'room_created', code });
}

function unirseSala(socket, message) {
  if (socket.roomCode) {
    error(socket, 'Ya estás en una sala.');
    return;
  }

  const code = typeof message.code === 'string' ? message.code.trim().toUpperCase() : '';
  const room = rooms.get(code);
  if (!/^[A-F0-9]{4}$/.test(code) || !room) {
    error(socket, 'No se encontró esa sala. Revisa el código.');
    return;
  }
  if (room.players.size >= 2) {
    error(socket, 'La sala ya está completa.');
    return;
  }

  room.players.set(socket, -1);
  socket.roomCode = code;
  socket.side = -1;
  for (const [player, side] of room.players) {
    enviar(player, { type: 'room_ready', code, side });
  }
}

function reenviarMovimiento(socket, message) {
  const room = salaDe(socket);
  const move = message.move;
  if (!room || room.players.size !== 2) {
    error(socket, 'La partida todavía no tiene dos jugadores.');
    return;
  }
  if (socket.side !== room.turn) {
    error(socket, 'No es tu turno.');
    return;
  }
  if (!move || !['desdeF', 'desdeC', 'f', 'c'].every((key) =>
    Number.isInteger(move[key]) && move[key] >= 0 && move[key] < 8) ||
    typeof message.sigue !== 'boolean') {
    error(socket, 'Movimiento inválido.');
    return;
  }

  for (const player of room.players.keys()) {
    if (player !== socket) enviar(player, { type: 'move', move });
  }
  if (!message.sigue) room.turn = -room.turn;
}

webSocketServer.on('connection', (socket) => {
  socket.on('error', (socketError) => {
    console.error('Error de WebSocket:', socketError.message);
  });

  socket.on('message', (rawMessage) => {
    let message;
    try {
      message = JSON.parse(rawMessage.toString());
    } catch {
      error(socket, 'Mensaje inválido.');
      return;
    }

    if (!message || typeof message.type !== 'string') {
      error(socket, 'Solicitud inválida.');
    } else if (message.type === 'create') {
      crearSala(socket);
    } else if (message.type === 'join') {
      unirseSala(socket, message);
    } else if (message.type === 'move') {
      reenviarMovimiento(socket, message);
    } else {
      error(socket, 'Acción desconocida.');
    }
  });

  socket.on('close', () => liberarSala(socket));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Damas disponible en http://localhost:${PORT}`);
  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const network of interfaces || []) {
      if (network.family === 'IPv4' && !network.internal) {
        console.log(`En la red local: http://${network.address}:${PORT}`);
      }
    }
  }
  console.log('En Windows, permite el acceso por el firewall si se solicita.');
});
