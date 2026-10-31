# Backrooms del Brainrot · Banda sonora

Plan de producción: **seis canciones generadas en Suno**, todas instrumentales. Las reutilizaciones y las ediciones de los finales salen de esas mismas seis tomas; no requieren generaciones adicionales.

## Canciones y prompts

| # | Canción | Usos |
|---|---|---|
| 1 | [Espere, por favor](tracks/01-espere-por-favor.md) | Lobby, trivia de las Backrooms y búsqueda de anclas. |
| 2 | [Nivel 0](tracks/02-nivel-0.md) | Sala 1: plataformas cooperativas. Reutilizar en Sala 3: contar las formas. |
| 3 | [Las piscinas](tracks/03-las-piscinas.md) | Sala 2: Un, dos, tres... ¡Tralalero! Una sola generación para toda la sala. |
| 4 | [Fallo de contención](tracks/04-fallo-de-contencion.md) | Sala 6: bomba. Reutilizar en Sala 0: Agarraos fuerte y presentación de la Fundación. |
| 5 | [Sahur dice](tracks/05-sahur-dice.md) | Sala 7: juego de memoria y búsqueda del ancla final. |
| 6 | [Fuera de las Backrooms](tracks/06-fuera-de-las-backrooms.md) | Una única canción para los tres finales: escape, pasajero y conversión en brainrots. |

Cada ficha incluye un prompt de estilo en inglés, exclusiones, estructura opcional y criterios para elegir la toma.

## Cómo generar

1. Copiar el prompt de estilo de la ficha y activar instrumental.
2. Añadir las exclusiones si la interfaz las admite. La estructura es opcional: dejar la letra vacía si provoca voces.
3. Usar el modelo disponible en vuestra cuenta. BPM, tonalidad y duración son objetivos musicales, no garantías. No se requieren controles avanzados concretos.
4. Conservar una toma por canción. Priorizar estabilidad, claridad y ausencia de voces. El presupuesto no presupone generar variantes.
5. Descargar con la mejor calidad disponible y guardar el enlace de la toma en su ficha.

## Cobertura de la partida

| Momento | Pista |
|---|---|
| Lobby | 01 · Espere, por favor |
| Presentación y Sala 0: Agarraos fuerte | 04 · Fallo de contención |
| Noclip | Efecto de transición; sin canción propia |
| Sala 1: plataformas | 02 · Nivel 0 |
| Sala 2: Tralalero | 03 · Las piscinas; silenciar en rojo |
| Sala 3: contar formas | «Local Forecast - Elevator» (Kevin MacLeod), ralentizado y filtrado como un hilo musical moribundo |
| Sala 4: trivia | «Thinking Music» (Kevin MacLeod), música de concurso |
| Sala 6: bomba | 04 · Fallo de contención |
| Sala 7: la salida de Sahur | 05 · Sahur dice |
| Búsqueda de anclas | «Sneaky Snitch» (Kevin MacLeod), de puntillas por la casa; en la búsqueda final, 05 |
| Final: escape | 06 · Fuera de las Backrooms |
| Final: pasajero | 06 · Misma toma, entera |
| Final: brainrots | 06 · Misma toma, entera, ralentizada y filtrada |

La Sala 5 está eliminada del juego. No necesita música.

## Preparación del audio

- Pistas 01–05: extraer un bucle estable de compases completos, recortar introducciones y colas, y comprobar la unión escuchando varias repeticiones. Suno no garantiza bucles perfectos.
- Pista 06: apertura inmediata y final corto. Sus tres usos salen de la misma grabación.
- Mantener la música por debajo de instrucciones, conversación y efectos. Revisar especialmente los avisos de Tralalero y los tambores de Sahur.
- Evitar pitidos, alarmas, cuentas atrás y golpes que parezcan señales del juego.
- Archivos previstos: los indicados en las fichas bajo `static/audio/music/`. Guardar también los originales.

## Integración

Las seis tomas están copiadas a `static/audio/music/` con los nombres de sus fichas. Los originales permanecen en esta carpeta.

La tele reproduce la música después de activar el sonido y permite silenciarla con «Música: sí/no». Las actualizaciones de estado conservan la posición de la pista. La música baja durante las escenas narrativas, se silencia en rojo y durante la demostración y respuesta de Sahur.

Los tres finales reproducen la canción entera una vez; el de brainrots, ralentizada y filtrada.

Las salas que no tenían canción propia (3, 4 y la búsqueda de anclas) usan temas gratuitos de Kevin MacLeod, y las salas
con simulación (menos el Nivel 0) llevan debajo un bucle de ambiente (agua, hangar, grillos). Fuentes, licencias y
atribución: `static/audio/CREDITS.md`.

Los archivos conservan el audio original: los puntos de bucle todavía no tienen un recorte musical revisado de oído. Los bucles actuales repiten la pista completa.
