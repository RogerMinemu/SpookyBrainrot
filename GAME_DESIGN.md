# SpookyBrainrot Escape — Diseño de juego (borrador v0.1)

> Grupo de 6–10 jugadores (sin límite duro), 18–30 años. Duración objetivo: 80–90 min.

## Premisa

Son las 3:00 AM. Demasiado scroll. El grupo hace *noclip* y cae en las **Backrooms del Brainrot**: una dimensión liminal hecha de memes podridos donde la Fundación SCP tenía contenidos a los brainrots italianos. La contención ha fallado.

Los móviles son lo único que sigue conectado a la realidad: son los **mandos**. En cada nivel hay un **Ancla de Realidad** escondida en el mundo real (la casa): un QR. Encontrarla abre el paso al siguiente nivel. Si no salís antes de la llamada del **Sahur**, Tung Tung Tung Sahur viene a por vosotros.

## Principios de diseño

1. **Información repartida.** La tele muestra lo común; cada móvil tiene un fragmento privado. Nadie resuelve solo: hay que hablar. Los fragmentos se reparten entre los jugadores conectados, así que funciona igual con 4 que con 14.
2. **Cerebro + cuerpo.** Cada sala tiene dos mitades: el puzzle en pantalla revela una pista, y la pista lleva a un QR escondido en la casa.
3. **Un brainrot por sala**, con una mecánica ligada a su personaje.
4. **Lore real.** Backrooms, SCP, espacios liminales y cine de terror. Premia al friki sin bloquear al que no lo es: siempre hay pista.

## Mecánicas globales

- **Medidor de Brainrot (%)**: sube con errores, pistas pedidas, QR trampa y tiempo de más. A más porcentaje, más se degrada la imagen (glitch, colores que sangran). Decide el final.
- **QR trampa**: QR falsos escondidos por la casa. Al escanear uno, un brainrot salta en la tele (jumpscare) y sube el Brainrot%. Cada trampa castiga una sola vez por partida; la segunda vez solo se ríe.
- **Pistas por votación**: cualquiera propone pedir pista y se pide si vota la mayoría. Cuesta Brainrot%.
- **Reloj del Sahur**: el reloj de la tele va de 3:00 a 4:30 (90 min reales). No hay game over: pasarse de hora sube el Brainrot% poco a poco.
- **Tres finales** según el Brainrot% final:
  - **< 40%**: escapáis.
  - **40–75%**: escapáis… pero algo vino con vosotros.
  - **> 75%**: os convertís en brainrots.

## QR fijos (se imprimen UNA vez)

- **7 anclas** (una por nivel, la última es la salida) + **8 trampas**. Tokens aleatorios generados una sola vez y guardados en el servidor.
- Desde que se quitó la sala 5, el **ancla 5 no la usa ninguna sala**: sigue impresa, pero no hace falta esconderla ni escribirle pista (`/admin/house` y la clave de QR lo indican). Si alguien la escanea, solo «duerme».
- Cada QR lleva `{PUBLIC_URL}/k/<token>`. Tras cada sala llega la fase **«Pistas (busca el QR)»**: la tele y el móvil muestran la pista, y el móvil trae un **botón de cámara** para escanear el QR sin salir del juego (mensaje `scan` por WebSocket, mismo resultado que `/k/<token>`, contestado solo a ese móvil).
  - Con HTTPS o en `localhost`, el botón abre un **visor en vivo** dentro de la página.
  - En la red de casa por HTTP normal, el navegador no deja que una web use la cámara: el mismo botón abre la **app de cámara** para hacer una foto y la página lee el QR de la foto.
  - Decodifica el `BarcodeDetector` nativo si existe; si no (iPhone), jsQR (vendorizado).
  - La cámara normal del móvil sigue funcionando: abre `/k/<token>` como antes.
- **¿Qué partida abre?**
  1. La del mando, si ese navegador ya está en `/play` (cookie).
  2. Si no, la única partida en curso (la que tiene la tele conectada).
  3. Si hubiera varias en curso, la página pide elegir.
- Un ancla solo funciona si su nivel está activo. Si la encuentran antes: *«Esta ancla aún duerme…»*, sin castigo.
- **Configuración de la casa** (una vez, vale para todas las partidas): para cada ancla eliges dónde la escondes de una lista de sitios típicos que ya traen su acertijo escrito, o escribes el tuyo. Ejemplo para la nevera:
  > *Frigo Camelo duerme donde la luz se enciende al abrir y se apaga al cerrar. ¿Seguro que se apaga cuando no miras?*

## Las salas

| # | Nivel | Guardián | Puzzle | Tipo | Min |
|---|---|---|---|---|---|
| 0 | Prólogo: Noclip | — | Agarraos fuerte | Tutorial / sincronía | 5 |
| 1 | Nivel 0: Habitaciones amarillas | Brr Brr Patapim | Plataformas cooperativas (4 niveles) | Coordinación en tiempo real | 12 |
| 2 | Las Piscinas | Tralalero Tralala | Un, dos, tres… ¡Tralalero! | Reflejos en tiempo real | 10 |
| 3 | Centro comercial de las 3 AM | Lirilì Larilà | Contad las formas | Observación / conteo | 10 |
| 4 | Sitio-19 | Ballerina Cappuccina | Trivia de las Backrooms | Trivia por consenso | 12 |
| 6 | Hangar abandonado | Bombardiro Crocodilo | Desactivad la bomba | Información repartida (Keep Talking) | 12 |
| 7 | Final | Tung Tung Tung Sahur | Sahur dice | Ritmo / Simon con trampas | 8 |

> **Estado:** todas las salas del plan son jugables: 0, 1, 2, 3, 4, 6 y 7. La **sala 5 se ha quitado** (la numeración no cambia: de la 4 se pasa a la 6). Ballerina Cappuccina, que guardaba la sala 5, pasa a presentar la trivia de la sala 4.

### 0 · Prólogo — Noclip

- La tele muestra un QR para unirse a `/play`. Cada jugador pone su nombre.
- «Empezar» lleva a la **intro de la sala 0**: la Fundación cuenta el prólogo (ver *Historia*) y después «Entrar» empieza el puzzle.
- **Agarraos fuerte**: todos mantienen pulsado un botón a la vez durante 5 s. Si uno suelta, se reinicia. Al lograrlo: noclip y caída al Nivel 0.
- Sin ancla: sirve para aprender el mando.

### 1 · Nivel 0 — Las habitaciones amarillas · Brr Brr Patapim

Moqueta húmeda, zumbido de fluorescentes. Patapim tiene los pies hundidos en la moqueta y os pide llegar hasta su ancla.

- **Plataformas cooperativas**: el móvil es un mando (izquierda, derecha, saltar) y cada jugador es un bichito de su color en la tele. Son **4 niveles** seguidos; se juega de verdad en tiempo real y la tele es quien hace la física.
- **Nivel 1, Torre humana**: la campana está demasiado alta. Alguien se sube a otro jugador para tocarla y que se abra la puerta.
- **Nivel 2, El botón pesado**: una verja se abre si el grupo mantiene pulsado un botón con suficiente peso (la mitad del grupo, mínimo 2) durante 1 s.
- **Nivel 3, Todos a bordo**: un foso demasiado ancho y una plataforma móvil que solo parte cuando todos los del lado izquierdo van a bordo.
- **Nivel 4, La llave**: hay que subir a una repisa con ayuda, coger la llave y llevarla a la puerta. Si el portador cae o se desconecta, la llave vuelve a su sitio.
- Un nivel se supera cuando **todos** los jugadores conectados han entrado por la puerta. Caerse al vacío solo devuelve a ese jugador al inicio y cuesta un poco de Brainrot% (con enfriamiento y tope).
- Al superar el nivel 4 se pasa a las pistas (busca el QR).

### 2 · Las Piscinas · Tralalero Tralala

Azulejos blancos infinitos, agua que no refleja. Tralalero nada con sus Nike.

- **Un, dos, tres… ¡Tralalero!**: cada jugador tiene un carril y nada hacia Tralalero **solo mientras la luz está en verde**. Cuando se pone en rojo, hay que quedarse quieto: quien se mueva fuera de la ventana de gracia (300 ms) vuelve al inicio y sube el Brainrot%.
- Hay **falsos giros**: Tralalero se da la vuelta a medias y vuelve a mirar al frente; hay que leerlos bien.
- Quien ya ha llegado puede **distraer** a Tralalero (un solo uso compartido cada 6 s): durante 2 s el rojo no pilla a nadie.
- Se supera cuando todos los jugadores conectados han llegado a la meta.

### 3 · Centro comercial de las 3 AM · Lirilì Larilà

Centro comercial vacío, hilo musical a cámara lenta. Lirilì, el elefante-cactus con reloj, ha parado todos los relojes a las tres.

- **Contad las formas**: la tele muestra un campo de formas (círculos, triángulos, cuadrados, estrellas, corazones, cruces, lunas y rombos) de colores al azar. **El color da igual: solo cuenta la forma.**
- A cada jugador se le asigna **una forma** (distinta mientras haya formas libres; con más jugadores que formas, se repiten y todos deben acertar). El móvil solo tiene **dos botones: −1 y +1** sobre su propio contador.
- Cuenta atrás por ronda (30, 35 y 40 s). Al acabar, la tele enseña quién acertó y cuántas había de verdad. Si **todos** aciertan, siguiente ronda; si alguien falla, Brainrot% y la misma ronda con formas nuevas.
- **3 rondas**: 4, 6 y 8 formas distintas en pantalla (más si hay más jugadores) y cada vez más figuras. En la ronda 3 las formas **se mueven**.
- Nadie ve el contador de los demás hasta la comprobación.

### 4 · Sitio-19 · Ballerina Cappuccina

Terminal de la Fundación, expedientes con barras de [REDACTADO]. Ballerina Cappuccina hace de presentadora.

- **Trivia de las Backrooms**, en español: el origen de la creepypasta (4chan, 2019), el texto original, los niveles, las entidades (Smilers, Partygoers, Facelings…), el agua de almendras, las organizaciones de la wiki y la serie de Kane Pixels.
- Se resuelve **entre todos**: cada móvil vota A, B, C o D y puede cambiar su voto. La respuesta **solo se envía cuando todos votan lo mismo** (2,5 s de acuerdo; si alguien cambia de idea, se cancela). La tele enseña quién ha votado qué y quién falta.
- Al responder, la tele revela la buena con un dato curioso. Acierto: suma. Fallo: Brainrot% y siguiente pregunta.
- Hay que llegar a **6 aciertos**. Las preguntas no se repiten hasta agotar el banco.

### 6 · Hangar abandonado · Bombardiro Crocodilo

Bombardiro suelta una bomba en mitad del hangar. Es un *Keep Talking and Nobody Explodes* con el manual hecho pedazos.

- **Solo un móvil tiene la bomba**: el del **artificiero**. Ni la tele ni los demás la ven: la tele solo enseña el reloj, los errores y qué módulos quedan.
- **El manual se reparte** entre los demás móviles: 14 páginas (reglas de cables según cuántos haya, botón, cada columna de símbolos y cada lista de contraseñas) repartidas en el número de jugadores. Cuantos más sois, menos sabe cada uno y más hay que hablar. Si el artificiero está solo, tiene también el manual entero.
- **4 módulos**: cables (3 a 6, de colores; las reglas dependen del número de serie), botón (pulsar y soltar, o mantener hasta que salga una tira de color y soltar cuando el reloj muestre cierta cifra), símbolos de brainrots (pulsarlos en el orden de su columna) y contraseña (girar letras hasta formar la única palabra posible de las listas).
- Cuenta atrás de **5 min**; cada error resta **30 s** y un poco de Brainrot%. Con **3 errores** o el reloj a cero: **¡BUM!**, Brainrot% y una bomba nueva para el siguiente jugador.
- Si el artificiero se desconecta, la bomba pasa al siguiente jugador conectado tal y como está.

### 7 · Final — Sahur dice · Tung Tung Tung Sahur

*Tung. Tung. Tung.* Algo golpea al otro lado de la pantalla.

- **Sahur dice**: la tele toca una secuencia de tambores y el grupo la repite en orden. Los tambores (entre 4 y 6) se reparten entre los móviles: cada móvil solo toca los suyos y **no ve la secuencia**, así que hay que hablar. Si hay menos jugadores que tambores, uno lleva varios.
- **Rondas con trampa**: en las rondas 2 y 3 algunas órdenes llegan **sin** el «Sahur dice»: esas hay que ignorarlas, no tocarlas.
- 3 rondas (secuencias de 4, 5 y 6 pasos). Un fallo (tambor equivocado, de otro jugador o fuera de orden) cuesta Brainrot% y repite la ronda con una secuencia nueva.
- Al superarlo: pista de la última ancla, **la salida**. Escanearla lanza la cinemática del final que os toque.

## Historia: los brainrots cuentan el juego

No es una ristra de minijuegos: entre sala y sala, la tele pone una **cinemática** y los brainrots narran la historia y llevan al grupo de un nivel al siguiente.

- **La Fundación** habla desde una terminal verde: avisa del fallo de contención, explica los móviles, las anclas (QR), los QR trampa y el Brainrot%.
- **Cada guardián** (Patapim, Tralalero, Lirilì, Ballerina, Bombardiro y Sahur) tiene tres escenas:
  - **intro**: presenta su nivel y explica su prueba, con su personaje y su voz;
  - **pista**: al superar la prueba, lee la pista de la casa y recuerda escanear el QR con la cámara del móvil. Si el anfitrión no la escribió, sale una variante sin pista;
  - **relevo**: con la puerta abierta, manda al grupo al siguiente nivel y presenta a quien los espera.
- **Sahur** llama por teléfono antes de su sala (y en el prólogo y en un final) para meter prisa: a las 4:30 pasa a recoger.
- **Finales**: uno por banda de Brainrot% (escapáis, algo vino con vosotros, os convertís en brainrots).
- **Sustos**: cada QR trampa despierta a su brainrot con su frase.
- Las voces son pitidos sintetizados por letra, como en los juegos de rol clásicos, distintos para cada personaje. La boca de los rigs (Patapim, Tralalero, Sahur) se mueve con las vocales; los cameos dan saltitos al hablar.
- Los **móviles** muestran «Mirad la tele» con quién habla y su frase, y ocultan «Entrar» / «Siguiente sala» hasta que acaba (si la tele deja de avisar 6 s, vuelven).
- El **anfitrión** controla la tele: Espacio, Intro, → o un clic pasan de frase; Esc o «Saltar» terminan la escena. Cada escena se ve una vez por partida (una tele recargada no la repite).
- Unos 8 minutos de narración en total. Guion: `static/js/story/script.js`.
- **Reparto como recurso gráfico**: `/static/dev/brainrots.html` pinta a los ocho y descarga cada pose en PNG transparente.

## Tiempo real y guardado

- **Carril de entrada**: cada móvil envía una máscara de botones (izquierda 1, derecha 2, saltar 4, acción 8) por WebSocket, sin pasar por el bloqueo de la partida. El servidor solo la retransmite a la tele; la tele simula a 60 Hz y solo informa de resultados (nivel superado, penalización, llegada). Cada resultado lleva `epoch` y nivel: un informe viejo se ignora.
- **Tele desconectada**: los móviles lo avisan en español y dejan de enviar; al volver, se reenvían las máscaras.
- **Constantes de penalización**: 2 de Brainrot% por fallo de simulación (enfriamiento 2,5 s, tope 12 por sala); 3 por fallo en el Sahur, por contar mal (sala 3) o por fallar una pregunta (sala 4); en la bomba, 1 por error y 5 por explosión. Todas las salas tienen un tope de 12 por partida de sala.
- **Guardado v2**: las partidas guardan el número de sala. Las partidas v1 se migran a la sala 2 en su introducción, pero una partida v2 **no se puede cargar con el código antiguo**. Para limpiar partidas, bórralas desde la portada; nunca edites `data/` a mano.

## Cameos (QR trampa)

Cada QR trampa es un brainrot distinto con su susto: Chimpanzini Bananini, Trippi Troppi, Boneca Ambalabu, La Vaca Saturno Saturnita, Frigo Camelo, Bombombini Gusini…

## Pendiente de decidir

- ¿El anfitrión juega o hace de game master? Quien esconde los QR sabe dónde están.
- Lista de sitios de la casa y sus acertijos.
- Música (Suno): intro, ambiente por sala y 3 finales.
