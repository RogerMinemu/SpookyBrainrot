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
- Cada QR lleva `{PUBLIC_URL}/k/<token>` y se escanea con la **cámara normal** del móvil (sin HTTPS ni permisos de cámara).
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
| 1 | Nivel 0: Habitaciones amarillas | Brr Brr Patapim | Laberinto a ciegas | Coordinación | 12 |
| 2 | Las Piscinas | Tralalero Tralala | Wordle maldito | Palabras | 10 |
| 3 | Centro comercial de las 3 AM | Lirilì Larilà | La fila del tiempo | Ordenar | 10 |
| 4 | Sitio-19 | Cappuccino Assassino | El infiltrado | Trivia + deducción social | 12 |
| 5 | Galería liminal | Ballerina Cappuccina | El cuadro que te mira | Rompecabezas + observación | 12 |
| 6 | Hangar abandonado | Bombardiro Crocodilo | Desactiva la bomba | Información asimétrica | 12 |
| 7 | Final | Tung Tung Tung Sahur | Responde al Sahur | Ritmo / Simon | 8 |

### 0 · Prólogo — Noclip

- Cinemática de intro (canción de Suno).
- La tele muestra un QR para unirse a `/play`. Cada jugador pone su nombre.
- **Agarraos fuerte**: todos mantienen pulsado un botón a la vez durante 5 s. Si uno suelta, se reinicia. Al lograrlo: noclip y caída al Nivel 0.
- Sin ancla: sirve para aprender el mando.

### 1 · Nivel 0 — Las habitaciones amarillas · Brr Brr Patapim

Moqueta húmeda, zumbido de fluorescentes. Patapim tiene los pies hundidos en la moqueta y os pide llegar hasta su ancla.

- **Laberinto a ciegas**: la tele enseña el laberinto a oscuras, solo se ve el círculo de linterna alrededor del grupo.
- Un jugador, el **Guía** (rota en cada intento), ve el mapa completo en su móvil.
- El resto se reparte las direcciones: cada móvil solo mueve hacia un lado (↑, ↓, ←, →).
- Un **Smiler** (una sonrisa en la oscuridad) patrulla. Si os pilla: vuelta al inicio y sube el Brainrot%.
- Con más jugadores hay direcciones repetidas: hay que coordinar quién pulsa.

### 2 · Las Piscinas · Tralalero Tralala

Azulejos blancos infinitos, agua que no refleja. Tralalero nada con sus Nike.

- **Wordle maldito** colaborativo: 6 intentos compartidos y cada intento lo escribe un jugador distinto, por turnos.
- Cada móvil recibe en secreto una letra que **no** está en la palabra. Hay que decirlo en voz alta.
- **Salpicón**: cada 2 intentos, Tralalero tapa una casilla ya revelada y hay que recordarla.
- Palabras del lore: `NOCLIP`, `SMILER`, `KETER`, `SAHUR`…

### 3 · Centro comercial de las 3 AM · Lirilì Larilà

Centro comercial vacío, hilo musical a cámara lenta. Lirilì, el elefante-cactus con reloj, ha desordenado el tiempo.

- **La fila del tiempo**: cada móvil recibe una carta de una peli de terror. No es el póster, sino una frase o un objeto icónico: *«¿Te gustan las películas de miedo?»*, un triciclo en un pasillo de hotel, una cinta VHS que dice «7 días».
- Los jugadores se ponen **en fila de verdad** por año de estreno y cada uno marca su posición en el móvil. La tele dice cuántos están bien colocados, no cuáles (estilo Mastermind).
- **Ronda 1**: décadas separadas (Psicosis 1960, Halloween 1978, Scream 1996, Hereditary 2018…).
- **Ronda 2**: años cercanos (Alien 1979 / El resplandor 1980 / Pesadilla en Elm Street 1984).
- **Ronda 3, trampa**: Lirilì cuela una peli que no existe. Hay que detectarla y sacarla de la fila.

### 4 · Sitio-19 · Cappuccino Assassino

Terminal de la Fundación, expedientes con barras de [REDACTADO]. Cappuccino Assassino se ha infiltrado en el equipo.

- **El infiltrado**: trivia de SCP, Backrooms y terror. Cada pregunta se vota desde el móvil y cuenta la mayoría.
- Un jugador, al azar y en secreto, está **poseído**. Su móvil le da «pistas» falsas pero convincentes, y su objetivo es que el grupo falle sin que lo descubran.
- Al final, votación: ¿quién es el infiltrado? Si aciertan, baja el Brainrot%. Si fallan, sube.
- Cada acierto destapa un trozo del expediente censurado, que contiene la pista del ancla.
- Ejemplos:
  - ¿Qué hace SCP-173 si dejas de mirarlo?
  - ¿Cuál es la clase de objeto más peligrosa: Safe, Euclid o Keter?
  - ¿Qué entidad de las Backrooms organiza fiestas y firma con `=)`?

### 5 · Galería liminal · Ballerina Cappuccina

Cuadros de espacios liminales: piscina vacía, parque infantil de noche, pasillo de hotel. Suena una caja de música.

- **Parte 1, rompecabezas**: el cuadro está roto y las piezas se reparten entre los móviles. Cada jugador **lanza** su pieza a la tele con un gesto hacia arriba y luego la coloca.
- **Parte 2, ¿qué ha cambiado?**: con el cuadro completo, se apaga la imagen 2 s. Al volver, algo es distinto: una figura al fondo, una puerta que no estaba. Hay que tocar en el móvil dónde está el cambio.
- 3 rondas, cada una más sutil. Cada fallo: la bailarina avanza un paso hacia la pantalla.

### 6 · Hangar abandonado · Bombardiro Crocodilo

Bombardiro suelta una bomba en mitad de la sala.

- **Desactiva la bomba**: la bomba se ve en la tele, pero solo el móvil del **Artificiero** (rota en cada módulo) puede tocarla.
- El manual de desactivación está repartido en páginas entre el resto de móviles.
- 3 módulos temáticos: cables de colores, símbolos de brainrots y un botón que hay que soltar en el momento justo.
- Cuenta atrás de 5 min; cada error resta tiempo.

### 7 · Final — La llamada del Sahur · Tung Tung Tung Sahur

*Tung. Tung. Tung.* Algo golpea al otro lado de la pantalla.

- **Responde al Sahur**: cada móvil es un tambor con su color y sonido. La tele toca una secuencia y el grupo la repite en orden, cada uno cuando le toca. La secuencia crece.
- 3 llamadas. Cada fallo acerca a Tung Tung en la pantalla.
- Al superarlo: pista de la última ancla, **la salida**. Escanearla lanza la cinemática del final que os toque.

## Cameos (QR trampa)

Cada QR trampa es un brainrot distinto con su susto: Chimpanzini Bananini, Trippi Troppi, Boneca Ambalabu, La Vaca Saturno Saturnita, Frigo Camelo, Bombombini Gusini…

## Pendiente de decidir

- ¿El anfitrión juega o hace de game master? Quien esconde los QR sabe dónde están.
- Lista de sitios de la casa y sus acertijos.
- Música (Suno): intro, ambiente por sala y 3 finales.
