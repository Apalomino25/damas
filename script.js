const TAM = 70;
const PROFUNDIDAD = [0, 2, 4]; // 0 = al azar
const NOMBRES = ['Fácil', 'Medio', 'Difícil'];

// ---------- TABLERO ----------
function crearTablero() {
  const tablero = [];
  for (let f = 0; f < 8; f++) {
    tablero.push([]);
    for (let c = 0; c < 8; c++) {
      let valor = 0;
      if ((f + c) % 2 === 1) {
        if (f < 3) valor = -1;       // fichas de la IA (arriba)
        else if (f > 4) valor = 1;   // tus fichas (abajo)
      }
      tablero[f].push(valor);
    }
  }
  return tablero;
}

function dentro(f, c) {
  return f >= 0 && f < 8 && c >= 0 && c < 8;
}

// Una ficha normal va en una dirección; una dama, en las dos
function direcciones(ficha) {
  if (Math.abs(ficha) === 2) return [-1, 1];
  return [ficha > 0 ? -1 : 1];
}

// ---------- REGLAS ----------
function movimientosSimples(tablero, f, c) {
  const ficha = tablero[f][c];
  const dama = Math.abs(ficha) === 2;
  const destinos = [];
  for (const dir of direcciones(ficha)) {
    for (const dc of [-1, 1]) {
      let nf = f + dir, nc = c + dc;
      while (dentro(nf, nc) && tablero[nf][nc] === 0) {
        destinos.push({ f: nf, c: nc, captura: null });
        if (!dama) break;          // la ficha normal avanza solo una casilla
        nf += dir; nc += dc;       // la dama sigue por la diagonal
      }
    }
  }
  return destinos;
}

function saltos(tablero, f, c) {
  const ficha = tablero[f][c];
  const dama = Math.abs(ficha) === 2;
  const lista = [];
  for (const dir of direcciones(ficha)) {
    for (const dc of [-1, 1]) {
      let mf = f + dir, mc = c + dc;

      // la dama recorre las casillas vacías hasta encontrar una pieza
      if (dama) {
        while (dentro(mf, mc) && tablero[mf][mc] === 0) { mf += dir; mc += dc; }
      }

      // ¿hay una pieza rival?
      if (!dentro(mf, mc) || tablero[mf][mc] * ficha >= 0) continue;

      // casillas de aterrizaje: las vacías justo después de la pieza
      let nf = mf + dir, nc = mc + dc;
      while (dentro(nf, nc) && tablero[nf][nc] === 0) {
        lista.push({ f: nf, c: nc, captura: { f: mf, c: mc } });
        if (!dama) break;
        nf += dir; nc += dc;
      }
    }
  }
  return lista;
}

// Todos los movimientos de un bando.
// La captura es OPCIONAL: se devuelven saltos y movimientos normales.
// "forzada" = [f, c] de la ficha que está en medio de una cadena de saltos
// (en ese caso solo puede seguir saltando).
function todosLosMovimientos(tablero, lado, forzada) {
  const listaSaltos = [];
  const listaSimples = [];
  for (let f = 0; f < 8; f++) {
    for (let c = 0; c < 8; c++) {
      if (tablero[f][c] * lado <= 0) continue;
      if (forzada && (forzada[0] !== f || forzada[1] !== c)) continue;
      for (const d of saltos(tablero, f, c)) {
        listaSaltos.push({ desdeF: f, desdeC: c, ...d });
      }
      for (const d of movimientosSimples(tablero, f, c)) {
        listaSimples.push({ desdeF: f, desdeC: c, ...d });
      }
    }
  }
  if (forzada) return listaSaltos;
  return listaSaltos.concat(listaSimples);
}

// Aplica un movimiento sobre una COPIA del tablero
function aplicar(tablero, m) {
  const nt = tablero.map(fila => fila.slice());
  let ficha = nt[m.desdeF][m.desdeC];
  nt[m.desdeF][m.desdeC] = 0;

  let corono = false;
  if (ficha === 1 && m.f === 0) { ficha = 2; corono = true; }
  if (ficha === -1 && m.f === 7) { ficha = -2; corono = true; }

  nt[m.f][m.c] = ficha;
  if (m.captura) nt[m.captura.f][m.captura.c] = 0;

  // el salto continúa si capturó, no se coronó y puede capturar otra vez
  const sigue = !!m.captura && !corono && saltos(nt, m.f, m.c).length > 0;
  return { tablero: nt, sigue, corono };
}

// ---------- INTELIGENCIA ARTIFICIAL ----------
// Puntuación del tablero: positivo = bueno para la IA
function evaluar(tablero) {
  let s = 0;
  for (let f = 0; f < 8; f++) {
    for (let c = 0; c < 8; c++) {
      const v = tablero[f][c];
      if (v === 0) continue;
      let x = Math.abs(v) === 2 ? 160 : 100;
      if (v === -1) x += f * 3;
      if (v === 1) x += (7 - f) * 3;
      s += v < 0 ? x : -x;
    }
  }
  return s;
}

// Minimax con poda alfa-beta
function buscar(tablero, lado, prof, forzada, alfa, beta) {
  const movs = todosLosMovimientos(tablero, lado, forzada);
  if (movs.length === 0) return lado === -1 ? -9999 - prof : 9999 + prof;
  if (prof <= 0) return evaluar(tablero);

  const maximiza = lado === -1; // la IA maximiza, tú minimizas
  let mejor = maximiza ? -Infinity : Infinity;
  for (const m of movs) {
    const r = aplicar(tablero, m);
    const v = r.sigue
      ? buscar(r.tablero, lado, prof, [m.f, m.c], alfa, beta)
      : buscar(r.tablero, -lado, prof - 1, null, alfa, beta);
    if (maximiza) { mejor = Math.max(mejor, v); alfa = Math.max(alfa, v); }
    else          { mejor = Math.min(mejor, v); beta = Math.min(beta, v); }
    if (beta <= alfa) break;
  }
  return mejor;
}

// ---------- ESCENA DE PHASER ----------
class Juego extends Phaser.Scene {
  constructor() {
    super('juego');
  }

  create() {
    this.nivel = 0;
    this.modo = null;
    this.partidaActiva = false;
    this.conectado = false;
    this.miLado = 1;
    this.sonidoActivado = true;
    this.audio = null;
    this.musica = new Audio('sonido/fondo.mp3');
    this.musica.loop = true;
    this.musica.volume = 0.12;
    this.sonidoComer = new Audio('sonido/comer.mp3');
    this.sonidoComer.volume = 0.7;
    this.g = this.add.graphics();
    this.texto = this.add.text(14, 570, '', { fontSize: '20px', color: '#ffffff' });
    this.input.on('pointerdown', (p) => this.alHacerClic(p));
  }

  iniciarAudio() {
    if (!this.audio) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      this.audio = new AudioContext();
    }
    if (this.audio.state === 'suspended') this.audio.resume();
  }

  actualizarMusica() {
    if (this.sonidoActivado && this.partidaActiva && !this.fin) {
      this.musica.play().catch(() => {});
    } else {
      this.musica.pause();
    }
  }

  tono(frecuencia, duracion, forma = 'sine', volumen = 0.08, retraso = 0) {
    if (!this.sonidoActivado || !this.audio) return;
    const ahora = this.audio.currentTime + retraso;
    const oscilador = this.audio.createOscillator();
    const ganancia = this.audio.createGain();
    oscilador.type = forma;
    oscilador.frequency.setValueAtTime(frecuencia, ahora);
    ganancia.gain.setValueAtTime(0.0001, ahora);
    ganancia.gain.exponentialRampToValueAtTime(volumen, ahora + 0.025);
    ganancia.gain.exponentialRampToValueAtTime(0.0001, ahora + duracion);
    oscilador.connect(ganancia);
    ganancia.connect(this.audio.destination);
    oscilador.start(ahora);
    oscilador.stop(ahora + duracion + 0.03);
  }

  sonar(clave) {
    if (!this.sonidoActivado || !this.audio) return;
    if (clave === 'mover') {
      this.tono(330, 0.09, 'triangle', 0.11);
      this.tono(440, 0.07, 'sine', 0.035, 0.035);
    } else if (clave === 'corona') {
      [523.25, 659.25, 783.99, 1046.5].forEach((n, i) => this.tono(n, 0.32, 'sine', 0.09, i * 0.09));
    }
  }

  alternarMusica() {
    this.sonidoActivado = !this.sonidoActivado;
    const boton = document.getElementById('musicButton');
    boton.textContent = `♫ Sonido: ${this.sonidoActivado ? 'activado' : 'silenciado'}`;
    boton.setAttribute('aria-pressed', String(this.sonidoActivado));
    if (this.sonidoActivado) this.iniciarAudio();
    this.actualizarMusica();
  }

  efectoMovimiento(m, coronada) {
    const color = coronada ? 0xffd447 : (m.captura ? 0xff765e : 0x9cffc0);
    const x = m.c * TAM + TAM / 2;
    const y = m.f * TAM + TAM / 2;
    const halo = this.add.circle(x, y, coronada ? 15 : 9, color, 0.7).setDepth(5);
    this.tweens.add({ targets: halo, radius: coronada ? 38 : 28, alpha: 0, duration: coronada ? 550 : 330,
      onComplete: () => halo.destroy() });
    if (m.captura || coronada) {
      for (let i = 0; i < 8; i++) {
        const angulo = i * Math.PI / 4;
        const chispa = this.add.circle(x, y, coronada ? 4 : 3, color, 1).setDepth(6);
        this.tweens.add({ targets: chispa, x: x + Math.cos(angulo) * 34, y: y + Math.sin(angulo) * 34,
          alpha: 0, scale: 0.2, duration: 420, onComplete: () => chispa.destroy() });
      }
    }
  }

  iniciar() {
    if (this.ov) { this.ov.destroy(); this.ov = null; }
    this.tablero = crearTablero();
    this.seleccion = null;
    this.forzada = null;
    this.turno = 1;      // 1 = tú, -1 = IA
    this.fin = false;
    this.dibujar();
    this.siguiente();
  }

  iniciarContraIA() {
    this.modo = 'ia';
    this.partidaActiva = true;
    this.conectado = false;
    this.iniciar();
    this.actualizarMusica();
  }

  iniciarMultijugador(lado, conectado, codigo) {
    this.modo = 'multi';
    this.miLado = lado;
    this.conectado = conectado;
    this.partidaActiva = conectado;
    this.codigoSala = codigo;
    this.nivel = 0;
    this.iniciar();
    this.actualizarMusica();
    if (!conectado) this.estado('Esperando a que se una tu oponente...');
  }

  estado(msg) {
    if (this.modo === 'multi') {
      this.texto.setText(this.codigoSala ? `Código ${this.codigoSala} · ${msg}` : msg);
    } else if (this.modo === 'ia') {
      this.texto.setText(`Nivel ${this.nivel + 1}/${PROFUNDIDAD.length} ${NOMBRES[this.nivel]} · ${msg}`);
    }
  }

  despuesDeMover(m, sincronizar = true) {
    const r = aplicar(this.tablero, m);
    this.tablero = r.tablero;
    this.iniciarAudio();

    if (sincronizar && this.modo === 'multi') {
      window.enviarMovimiento(m, r.sigue);
    }

    // sonido según lo que pasó
    if (m.captura && this.sonidoActivado) {
      this.sonidoComer.currentTime = 0;
      this.sonidoComer.play().catch(() => {});
    }
    if (r.corono) this.sonar('corona');
    else if (!m.captura) this.sonar('mover');
    this.efectoMovimiento(m, r.corono);

    if (r.sigue) {
      this.forzada = [m.f, m.c];
      this.seleccion = this.turno === 1 ? [m.f, m.c] : null;
    } else {
      this.forzada = null;
      this.seleccion = null;
      this.turno = -this.turno;
    }
    this.dibujar();
    this.siguiente();
  }

  siguiente() {
    const movs = todosLosMovimientos(this.tablero, this.turno, this.forzada);
    if (movs.length === 0) {
      this.fin = true;
      this.partidaActiva = false;
      this.actualizarMusica();
      this.mostrarFin(this.modo === 'multi' ? -this.turno === this.miLado : this.turno === -1);
    } else if (this.modo === 'multi') {
      if (!this.conectado) {
        this.estado('Esperando a que se una tu oponente...');
      } else if (this.turno === this.miLado) {
        this.estado(this.forzada ? 'Continúa capturando' : 'Tu turno');
      } else {
        this.estado('Turno de tu oponente');
      }
    } else if (this.turno === -1) {
      this.estado('La IA está pensando...');
      this.time.delayedCall(500, () => this.jugarIA());
    } else {
      this.estado(this.forzada ? 'Sigue saltando' : 'Tu turno');
    }
  }

  jugarIA() {
    if (this.modo !== 'ia' || !this.partidaActiva) return;
    const movs = todosLosMovimientos(this.tablero, -1, this.forzada);
    const prof = PROFUNDIDAD[this.nivel];
    let candidatos = movs;

    if (prof > 0) {
      let mejorV = -Infinity;
      candidatos = [];
      for (const m of movs) {
        const r = aplicar(this.tablero, m);
        const v = r.sigue
          ? buscar(r.tablero, -1, prof, [m.f, m.c], -Infinity, Infinity)
          : buscar(r.tablero, 1, prof - 1, null, -Infinity, Infinity);
        if (v > mejorV) { mejorV = v; candidatos = [m]; }
        else if (v === mejorV) candidatos.push(m);
      }
    }
    // entre los mejores (o entre todos, si es aleatoria) elige uno al azar
    const m = candidatos[Math.floor(Math.random() * candidatos.length)];
    this.despuesDeMover(m);
  }

  mostrarFin(gano) {
    if (this.modo === 'multi') {
      const ov = this.add.container(0, 0);
      this.ov = ov;
      ov.add(this.add.rectangle(280, 280, 560, 560, 0x000000, 0.7));
      const titulo = gano ? '¡Ganaste!' : 'Ganó tu oponente';
      ov.add(this.add.text(280, 240, titulo, { fontSize: '36px', color: '#ffffff' }).setOrigin(0.5));

      const boton = this.add.text(280, 320, 'Volver al menú', {
        fontSize: '26px', color: '#1b1b1f', backgroundColor: '#ffd447', padding: { x: 20, y: 10 }
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      boton.on('pointerdown', () => window.volverAlMenu());
      ov.add(boton);
      return;
    }

    const ultimo = this.nivel === PROFUNDIDAD.length - 1;
    const titulo = gano ? (ultimo ? '¡Eres el campeón!' : '¡Nivel superado!') : 'Perdiste esta vez';
    const boton = gano ? (ultimo ? 'Jugar de nuevo' : 'Siguiente nivel') : 'Reintentar nivel';

    const ov = this.add.container(0, 0);
    this.ov = ov;
    ov.add(this.add.rectangle(280, 280, 560, 560, 0x000000, 0.7));
    ov.add(this.add.text(280, 240, titulo, { fontSize: '36px', color: '#ffffff' }).setOrigin(0.5));

    const b = this.add.text(280, 320, boton, {
      fontSize: '26px', color: '#1b1b1f', backgroundColor: '#ffd447', padding: { x: 20, y: 10 }
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    b.on('pointerdown', () => {
      this.time.delayedCall(50, () => {
        if (gano) this.nivel = ultimo ? 0 : this.nivel + 1;
        this.partidaActiva = true;
        this.iniciar();
      });
    });
    ov.add(b);
  }

  alHacerClic(p) {
    const ladoLocal = this.modo === 'multi' ? this.miLado : 1;
    if (!this.partidaActiva || this.fin || this.turno !== ladoLocal) return;
    const c = Math.floor(p.x / TAM);
    const f = Math.floor(p.y / TAM);
    if (f < 0 || f > 7 || c < 0 || c > 7) return;

    const movs = todosLosMovimientos(this.tablero, ladoLocal, this.forzada);

    // ¿clic en un destino de la ficha seleccionada?
    if (this.seleccion) {
      const [sf, sc] = this.seleccion;
      const m = movs.find(m => m.desdeF === sf && m.desdeC === sc && m.f === f && m.c === c);
      if (m) { this.despuesDeMover(m); return; }
    }

    // solo se seleccionan fichas con movimientos válidos
    if (movs.some(m => m.desdeF === f && m.desdeC === c)) {
      this.seleccion = [f, c];
    } else if (!this.forzada) {
      this.seleccion = null;
    }
    this.dibujar();
  }

  recibirMovimiento(m) {
    if (this.modo !== 'multi' || !this.partidaActiva || this.turno === this.miLado) return;
    const legal = todosLosMovimientos(this.tablero, this.turno, this.forzada)
      .find(jugada => jugada.desdeF === m.desdeF && jugada.desdeC === m.desdeC &&
        jugada.f === m.f && jugada.c === m.c);
    if (!legal) {
      window.volverAlMenu('La jugada recibida no coincide con el tablero. Crea otra sala.');
      return;
    }
    this.despuesDeMover(legal, false);
  }

  dibujar() {
    this.g.clear();

    for (let f = 0; f < 8; f++) {
      for (let c = 0; c < 8; c++) {
        // casilla
        const color = (f + c) % 2 === 0 ? 0xf0d9b5 : 0xb58863;
        this.g.fillStyle(color, 1);
        this.g.fillRect(c * TAM, f * TAM, TAM, TAM);

        // resaltado de la ficha seleccionada
        if (this.seleccion && this.seleccion[0] === f && this.seleccion[1] === c) {
          this.g.fillStyle(0xffe066, 0.6);
          this.g.fillRect(c * TAM, f * TAM, TAM, TAM);
        }

        // ficha
        const valor = this.tablero[f][c];
        if (valor !== 0) {
          const x = c * TAM + TAM / 2;
          const y = f * TAM + TAM / 2;
          this.g.fillStyle(valor > 0 ? 0xd64545 : 0x2b2b2b, 1);
          this.g.fillCircle(x, y, 28);
          if (Math.abs(valor) === 2) {   // la dama lleva un círculo dorado
            this.g.fillStyle(0xffd447, 1);
            this.g.fillCircle(x, y, 12);
          }
        }
      }
    }

    // destinos posibles (verde = movimiento, naranja = captura)
    const ladoLocal = this.modo === 'multi' ? this.miLado : 1;
    if (this.seleccion && this.turno === ladoLocal) {
      const [sf, sc] = this.seleccion;
      const movs = todosLosMovimientos(this.tablero, ladoLocal, this.forzada)
        .filter(m => m.desdeF === sf && m.desdeC === sc);
      for (const m of movs) {
        this.g.fillStyle(m.captura ? 0xff9f1c : 0x3ddc84, 0.9);
        this.g.fillCircle(m.c * TAM + TAM / 2, m.f * TAM + TAM / 2, 11);
      }
    }
  }
}

const juego = new Phaser.Game({
  type: Phaser.AUTO,
  width: 560,
  height: 600,
  scene: Juego,
  parent: 'game'
});

let conexion = null;
const menu = document.getElementById('menu');
const areaJuego = document.getElementById('game');
const panelEnLinea = document.getElementById('onlinePanel');
const estadoConexion = document.getElementById('status');
const botonCrearSala = document.getElementById('createRoomButton');
const botonUnirse = document.getElementById('joinRoomButton');
const entradaCodigo = document.getElementById('roomCodeInput');

function mostrarJuego() {
  menu.hidden = true;
  areaJuego.hidden = false;
}

function volverAlMenu(mensaje = '') {
  const escena = juego.scene.getScene('juego');
  if (escena) {
    escena.partidaActiva = false;
    escena.modo = null;
    escena.actualizarMusica();
  }
  if (conexion) {
    const socketAnterior = conexion;
    conexion = null;
    socketAnterior.close();
  }
  areaJuego.hidden = true;
  menu.hidden = false;
  panelEnLinea.hidden = true;
  estadoConexion.textContent = mensaje;
  botonCrearSala.disabled = false;
  botonUnirse.disabled = false;
}

function enviar(tipo, datos = {}) {
  if (!conexion || conexion.readyState !== WebSocket.OPEN) {
    estadoConexion.textContent = 'No hay conexión con el servidor.';
    return false;
  }
  conexion.send(JSON.stringify({ type: tipo, ...datos }));
  return true;
}

window.enviarMovimiento = (movimiento, sigue) => {
  enviar('move', {
    move: {
      desdeF: movimiento.desdeF,
      desdeC: movimiento.desdeC,
      f: movimiento.f,
      c: movimiento.c
    },
    sigue
  });
};
window.volverAlMenu = volverAlMenu;

function conectar(accion, codigo = '') {
  estadoConexion.textContent = 'Conectando al servidor...';
  botonCrearSala.disabled = true;
  botonUnirse.disabled = true;

  try {
    const protocolo = location.protocol === 'https:' ? 'wss:' : 'ws:';
    conexion = new WebSocket(`${protocolo}//${location.host}`);
  } catch (error) {
    estadoConexion.textContent = `No se pudo conectar: ${error.message}`;
    botonCrearSala.disabled = false;
    botonUnirse.disabled = false;
    return;
  }

  conexion.addEventListener('open', () => enviar(accion, { code: codigo }));
  conexion.addEventListener('message', (evento) => {
    let mensaje;
    try {
      mensaje = JSON.parse(evento.data);
    } catch (error) {
      volverAlMenu('El servidor envió una respuesta inválida.');
      return;
    }

    if (mensaje.type === 'error') {
      estadoConexion.textContent = mensaje.message;
      botonCrearSala.disabled = false;
      botonUnirse.disabled = false;
      conexion.close();
      conexion = null;
    } else if (mensaje.type === 'room_created') {
      estadoConexion.textContent = `Comparte este código: ${mensaje.code}. Esperando oponente...`;
      mostrarJuego();
      juego.scene.getScene('juego').iniciarMultijugador(1, false, mensaje.code);
    } else if (mensaje.type === 'room_ready') {
      estadoConexion.textContent = '';
      mostrarJuego();
      juego.scene.getScene('juego').iniciarMultijugador(mensaje.side, true, mensaje.code);
    } else if (mensaje.type === 'move') {
      juego.scene.getScene('juego').recibirMovimiento(mensaje.move);
    } else if (mensaje.type === 'opponent_disconnected') {
      volverAlMenu('Tu oponente se desconectó.');
    }
  });
  conexion.addEventListener('close', () => {
    if (conexion && juego.scene.getScene('juego').modo === 'multi') {
      volverAlMenu('Se perdió la conexión con el servidor.');
    }
  });
  conexion.addEventListener('error', () => {
    estadoConexion.textContent = 'No se pudo conectar. Comprueba que el servidor esté encendido.';
    botonCrearSala.disabled = false;
    botonUnirse.disabled = false;
  });
}

document.getElementById('soloButton').addEventListener('click', () => {
  estadoConexion.textContent = '';
  juego.scene.getScene('juego').iniciarAudio();
  mostrarJuego();
  juego.scene.getScene('juego').iniciarContraIA();
});

document.getElementById('multiButton').addEventListener('click', () => {
  juego.scene.getScene('juego').iniciarAudio();
  panelEnLinea.hidden = false;
  estadoConexion.textContent = '';
});

document.getElementById('musicButton').addEventListener('click', () => {
  juego.scene.getScene('juego').alternarMusica();
});

botonCrearSala.addEventListener('click', () => conectar('create'));
botonUnirse.addEventListener('click', () => {
  const codigo = entradaCodigo.value.trim().toUpperCase();
  if (!/^[A-F0-9]{4}$/.test(codigo)) {
    estadoConexion.textContent = 'El código debe tener 4 caracteres entre A-F y 0-9.';
    return;
  }
  conectar('join', codigo);
});
