# SpookyBrainrot

Escape room casero para jugar en casa: una tele muestra la partida, cada jugador usa su móvil
como mando y 15 códigos QR impresos (7 anclas y 8 señuelos) están escondidos por la casa.
Esta entrega es el "vertical slice": Sala 0 (agarraos fuerte), Sala 2 (la palabra maldita),
medidor de Brainrot, QR y pantalla final.

## Requisitos

- Python 3.10 o superior.

## Ejecutar en local

```bash
python -m venv .venv
.venv/Scripts/activate        # Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
cp env.example .env           # copia la plantilla y edítala (ver tabla)
python main.py
```

Abre `http://localhost:8000` en el ordenador conectado a la tele y crea una partida: te lleva
directamente a la pantalla de la tele (`/tv/<id>`). Toca la pantalla para empezar. Los jugadores escanean el QR del
lobby con el móvil (`/play`).

> La plantilla se llama `env.example` (no `.env.example`). Cópiala a `.env`; el fichero `.env`
> está en `.gitignore`.

## Variables de entorno

| Variable | Por defecto | Descripción |
| --- | --- | --- |
| `SERVER_PORT` | (vacía) | Puerto del servidor. Tiene prioridad. |
| `PORT` | (vacía) | Puerto alternativo. Si ninguno es válido, se usa `8000`. |
| `PUBLIC_URL` | `http://localhost:<puerto>` | URL pública que se codifica en los QR (`<PUBLIC_URL>/k/<token>`). Sin barra final. |
| `DB_PATH` | `data/spooky.db` | Ruta de la base de datos SQLite (la carpeta se crea sola). |
| `ADMIN_KEY` | (vacía) | Si se define, protege `/admin/*` y `/api/house*`. Vacía = abierto. |
| `MIN_PLAYERS` | `2` | Jugadores conectados mínimos para salir del lobby. |

Las variables del entorno (por ejemplo, las del panel) tienen prioridad sobre `.env`.

## Tests

```bash
pip install -r requirements-dev.txt
python -m pytest
```

## Preparar la casa y los QR

1. Abre `/admin/house` y escribe una pista por ancla (y, si quieres, el escondite). Es global:
   vale para todas las partidas. Las anclas sin pista usan un texto de relleno.
2. Abre `/admin/qr-sheet` e imprime la hoja: 15 tarjetas A4 etiquetadas `#01`..`#15`. Todas
   son iguales: **no se distingue ancla de señuelo** a simple vista.
3. Abre `/admin/qr-key` (SPOILER, solo para el anfitrión): dice qué es cada etiqueta
   (ancla N / señuelo con su cameo), su escondite y su pista. Avisa de las pistas que faltan.
4. Esconde las tarjetas. El ancla 7 es la salida.

Los tokens de los QR se generan **una sola vez** en el primer arranque y se guardan en la base de
datos. Nunca se regeneran, y no existe ningún endpoint para hacerlo.

### Cámara del iPhone

Si el QR se abre en el navegador integrado de la cámara, la cookie del jugador puede no estar
disponible. En ese caso, la página elige la partida en marcha si solo hay una; si hay varias,
muestra una lista para elegir. Lo ideal es abrirlo en el Safari/Chrome donde se unió el jugador.

## ADMIN_KEY

Con `ADMIN_KEY` definida, abre una vez `/admin/house?key=TU_CLAVE`: se guarda la cookie
`sb_admin` y el resto de páginas de administración funcionan sin repetir la clave. Sin clave,
la respuesta es 401; con clave incorrecta, 403.

## Modo debug (anfitrión)

Para probar el juego (y la interfaz acuarela) sin jugar todas las salas:

- **En la tele**: pulsa `Shift+D` para abrir o cerrar el cajón de debug. Está oculto por defecto y los jugadores
  no lo ven; mientras está abierto aparece una etiqueta roja "debug".
- **Desde tu móvil**: abre `/admin/debug` (enlazado desde la portada y desde las páginas de administración), elige
  la partida (en memoria o guardada) y usa los mismos controles sin enseñar nada en la tele.
- **Controles**: saltar a cualquier sala (lobby, Sala 0, Sala 2, final) y fase (introducción, puzzle, búsqueda del
  ancla, sala desbloqueada) con "Saltar" (el puzzle se reinicia con su `start`); "Completar puzzle"; deslizador de
  Brainrot con atajos 0/20/40/60/80/100 (se aplica al momento); eventos de prueba (jumpscare con el brainrot que
  elijas, salpicón, ronda fallida, ancla encontrada); "Reiniciar al lobby" (borra el progreso y conserva a los
  jugadores).
- **API**: `GET /admin/api/games`, `GET|POST /admin/api/games/<id>/debug[/jump|complete|brainrot|event|reset]`.
- **Seguridad**: todo cuelga de `/admin/*`, así que lo protege `ADMIN_KEY` (401 sin clave, 403 con clave incorrecta;
  abre `/admin/debug?key=TU_CLAVE` una vez y queda la cookie). Con `ADMIN_KEY` vacía todo está abierto: está bien en
  casa, pero defínela si lo publicas en internet. En la tele, el cajón usa esa misma cookie.

## Desplegar en Pterodactyl

1. Crea el servidor con un egg/yolk de **Python >= 3.10** (comprueba la versión exacta en tu panel).
2. Sube el proyecto a la raíz del servidor.
3. Instalación: `pip install -r requirements.txt` (el `requirements.txt` está en la raíz).
4. Comando de arranque: `python main.py`.
5. Puerto: el servidor lee `SERVER_PORT` y, si no existe, `PORT`; si ninguno es válido, usa `8000`.
   Asegúrate de que el puerto asignado en el panel llega en `SERVER_PORT`.
6. Define `PUBLIC_URL` con la dirección a la que se conectarán los móviles
   (por ejemplo, `http://192.168.1.50:25565`). Los QR impresos la contienen.
7. Opcional: define `ADMIN_KEY`.

## COPIA DE SEGURIDAD (importante)

**Haz copia de `data/spooky.db` y no borres nunca la carpeta `data/`.** Ahí están las partidas
guardadas y los tokens de los QR ya impresos. Si se pierde, los QR impresos dejan de valer y
hay que reimprimirlos todos. Si cambias `PUBLIC_URL` después de imprimir, los QR seguirán
apuntando a la dirección antigua.

## Arte acuarela (interfaz pintada)

La tele, el móvil y la portada se pintan al estilo "libro de cuentos de terror" en el propio navegador
(solo presentación: no hay cambios en el servidor ni en el protocolo).

- **Cómo funciona**: `static/js/art/` pinta UNA vez unas "placas" (fondo, panel, botón, cartel, marco, salpicón)
  con p5.js + p5.brush y las publica como imágenes WebP en variables CSS. El texto y los controles son DOM normal.
  Los colores salen de `static/css/theme.css` (tokens por `html[data-room]`).
- **Interruptor de emergencia**: añade `?art=off` a cualquier URL (`/tv/<id>?art=off`, `/play?art=off`) y se
  usa el fallback: papel 2D + lavados CSS, sin WebGL. También entra solo si no hay WebGL2, si se pierde el contexto
  o si la primera placa tarda más de 4 s.
- **Brainrot%**: `html[data-rot]` (0..5) degrada el fondo (filtros solo sobre `#art`), añade manchas, sangrado y
  un viñeteado que late, y acelera el temblor (`--boil-ms` de 83 a 42). El texto no cambia de sitio ni de contraste.
- **Páginas de anfitrión** (`/admin/house`, `/admin/qr-sheet`, `/admin/qr-key`) y las de escaneo usan solo
  `static/css/paper.css` (papel CSS + fuentes, sin canvas ni p5). La hoja de QR sigue en blanco y negro puro.
- **Exportar el fallback**: abre `/static/dev/art-export.html`, pulsa "Pintar todo" y guarda los WebP y el
  `manifest.json` en `static/art/fallback/` (hoy el manifest está vacío: el fallback es solo CSS).

### Licencias de terceros (`static/vendor/`, detalle y sha256 en `VENDOR.md` / `vendor.json`)

| Pieza | Versión | Licencia |
| --- | --- | --- |
| p5.js | 2.3.3 | LGPL-2.1 (sin modificar) |
| p5.brush | 2.2.3 | MIT |
| ClaudeAnimationBase (motor de pintura adaptado) | n/a | MIT |
| Permanent Marker (títulos) | v16 | Apache-2.0 (no es OFL) |
| Fredoka (texto) | v17 | OFL-1.1 |

## Estructura

- `app/core`: dominio puro (juego, motor, QR, Brainrot). `app/puzzles`: salas como plugins.
- `app/runtime`: capa async por partida. `app/db`: SQLite. `app/web`: HTTP y WebSocket.
- `static/`: tele, móvil y administración. `tests/`: pytest.
