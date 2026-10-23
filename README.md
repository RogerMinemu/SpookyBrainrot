# SpookyBrainrot

Escape room casero para jugar en casa: una tele muestra la partida, cada jugador usa su movil
como mando y 15 codigos QR impresos (7 anclas y 8 senuelos) estan escondidos por la casa.
Esta entrega es el "vertical slice": Sala 0 (agarraos fuerte), Sala 2 (la palabra maldita),
medidor de Brainrot, QR y pantalla final.

## Requisitos

- Python 3.10 o superior.

## Ejecutar en local

```bash
python -m venv .venv
.venv/Scripts/activate        # Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
cp env.example .env           # copia la plantilla y editala (ver tabla)
python main.py
```

Abre `http://localhost:8000` en el ordenador conectado a la tele, crea una partida: te lleva
directamente a la pantalla de la tele (`/tv/<id>`). Toca la pantalla para empezar. Los jugadores escanean el QR del
lobby con el movil (`/play`).

> La plantilla se llama `env.example` (no `.env.example`). Copiala a `.env`; el fichero `.env`
> esta en `.gitignore`.

## Variables de entorno

| Variable | Por defecto | Descripcion |
| --- | --- | --- |
| `SERVER_PORT` | (vacia) | Puerto del servidor. Tiene prioridad. |
| `PORT` | (vacia) | Puerto alternativo. Si ninguno es valido, se usa `8000`. |
| `PUBLIC_URL` | `http://localhost:<puerto>` | URL publica que se codifica en los QR (`<PUBLIC_URL>/k/<token>`). Sin barra final. |
| `DB_PATH` | `data/spooky.db` | Ruta de la base de datos SQLite (la carpeta se crea sola). |
| `ADMIN_KEY` | (vacia) | Si se define, protege `/admin/*` y `/api/house*`. Vacia = abierto. |
| `MIN_PLAYERS` | `2` | Jugadores conectados minimos para salir del lobby. |

Las variables del entorno (por ejemplo las del panel) tienen prioridad sobre `.env`.

## Tests

```bash
pip install -r requirements-dev.txt
python -m pytest
```

## Preparar la casa y los QR

1. Abre `/admin/house` y escribe una pista por ancla (y, si quieres, el escondite). Es global:
   vale para todas las partidas. Las anclas sin pista usan un texto de relleno.
2. Abre `/admin/qr-sheet` e imprime la hoja: 15 tarjetas A4 etiquetadas `#01`..`#15`. Todas
   son iguales: **no se distingue ancla de senuelo** a simple vista.
3. Abre `/admin/qr-key` (SPOILER, solo para el anfitrion): dice que es cada etiqueta
   (ancla N / senuelo con su cameo), su escondite y su pista. Avisa de las pistas que faltan.
4. Esconde las tarjetas. El ancla 7 es la salida.

Los tokens de los QR se generan **una sola vez** al primer arranque y se guardan en la base de
datos. Nunca se regeneran, y no existe ningun endpoint para hacerlo.

### Camara del iPhone

Si el QR se abre en el navegador integrado de la camara, la cookie del jugador puede no estar
disponible. En ese caso la pagina elige la partida en marcha si solo hay una; si hay varias,
muestra una lista para elegir. Lo ideal es abrirlo en Safari/Chrome donde se unio el jugador.

## ADMIN_KEY

Con `ADMIN_KEY` definida, abre una vez `/admin/house?key=TU_CLAVE`: se guarda la cookie
`sb_admin` y el resto de paginas de administracion funcionan sin repetir la clave. Sin clave
la respuesta es 401; con clave incorrecta, 403.

## Desplegar en Pterodactyl

1. Crea el servidor con un egg/yolk de **Python >= 3.10** (comprueba la version exacta en tu panel).
2. Sube el proyecto a la raiz del servidor.
3. Instalacion: `pip install -r requirements.txt` (el `requirements.txt` esta en la raiz).
4. Comando de arranque: `python main.py`.
5. Puerto: el servidor lee `SERVER_PORT` y, si no existe, `PORT`; si ninguno es valido usa `8000`.
   Asigna la asignacion de puerto del panel a `SERVER_PORT`.
6. Define `PUBLIC_URL` con la direccion a la que se conectaran los moviles
   (por ejemplo `http://192.168.1.50:25565`). Los QR impresos la contienen.
7. Opcional: define `ADMIN_KEY`.

## COPIA DE SEGURIDAD (importante)

**Haz copia de `data/spooky.db` y no borres nunca la carpeta `data/`.** Ahi estan las partidas
guardadas y los tokens de los QR ya impresos. Si se pierde, los QR impresos dejan de valer y
hay que reimprimirlos todos. Si cambias `PUBLIC_URL` despues de imprimir, los QR seguiran
apuntando a la direccion antigua.

## Estructura

- `app/core`: dominio puro (juego, motor, QR, Brainrot). `app/puzzles`: salas como plugins.
- `app/runtime`: capa async por partida. `app/db`: SQLite. `app/web`: HTTP y WebSocket.
- `static/`: tele, movil y administracion. `tests/`: pytest.
