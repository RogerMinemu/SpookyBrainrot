---
title: "Nivel 0"
track_number: 5
instrumental: true
explicit: false
# genre: ""  # Optional: only when this track's genre differs from the album's
game_key: "room1_backrooms"
target_file: "static/audio/music/room1_backrooms.mp3"
loop: true
suno_url: ""
sheet_music:
  pdf: ""
  musicxml: ""
  midi: ""
---

# Nivel 0

## Track Details

| Attribute | Detail |
|-----------|--------|
| **Track #** | 05 |
| **Title** | Nivel 0 |
| **Album** | [Backrooms del Brainrot](../README.md) |
| **Status** | In Progress |
| **Suno Link** | — |
| **Stems** | No |
| **Instrumental** | Yes |
| **Explicit** | No |
| **Game Key** | `room1_backrooms` |
| **Target File** | `static/audio/music/room1_backrooms.mp3` |
| **Loop** | Sí |
| **POV** | — (instrumental) |
| **Role** | Sala 1, «Las habitaciones amarillas» (guardián: Brr Brr Patapim): plataformas cooperativas, 4 niveles, ≈ 12 min; sigue sonando en la búsqueda del ancla |
| **Fade Out** | None (loop) |
| **Target Duration** | Generar 3:30; bucle exportado ≈ 3:00 |
| **Sources Verified** | N/A |

## Concept

Un juego cooperativo alegre que se ha quedado encerrado en las Backrooms. La energía es la de un plataformas para jugar en grupo, de los que te hacen gritar «¡súbete encima de mí!» y «¡no saltes todavía!»: un bucle saltarín, sencillo y pegadizo, en el que cada uno es un bichito de color. Pero está mal: la cinta se tambalea, algunas notas están medio tono fuera de sitio y, por debajo, nunca se apaga el zumbido de los fluorescentes.

El sabor de Brr Brr Patapim, el guardián con los pies hundidos en la moqueta, son los vientos graves: un fagot en staccato que hace «brr, brr» con frullato (lengua aleteando) y contesta a la melodía, más marimba, bongos y bloques de madera de bosque. Es mono y da un poco de grima a la vez, que es justo el tono del juego.

## Cross-References

### References TO This Track

| From Track | Reference Type | Detail |
|------------|---------------|--------|
| — | — | — |

### References FROM This Track

| To Track | Reference Type | Lyric Line | Detail |
|----------|---------------|------------|--------|
| 04 | motif | [Intro] | Arranca sobre el zumbido fluorescente con el que termina el noclip |
| 02 | character | [Groove B] | El «brr, brr» del fagot es Brr Brr Patapim, presentado en la estrofa 2 de la cinemática |

**Reference types:** `callback` (echoes earlier lyric/image), `motif` (recurring thematic element), `character` (same character reappears), `contrast` (deliberate inversion of earlier idea), `resolution` (resolves tension from earlier track)

<!-- END CROSS-REFERENCES -->

## Mood & Imagery

Moqueta húmeda, papel pintado amarillo, fluorescentes que zumban. Bichitos de colores que saltan unos encima de otros para tocar una campana. Una verja que solo se abre si pesáis lo suficiente. Una plataforma que no arranca hasta que estáis todos. Patapim al fondo, plantado en la moqueta como un árbol, mirando.

## Musical Direction

- **Tempo**: ~124 BPM, 4/4 saltarín
- **Key**: Do mayor, con alguna nota cromática «equivocada»; encaja con los SFX del juego (`open` y `win` son arpegios de Do)
- **Feel**: Bucle cooperativo alegre y mono, ligeramente torcido; ninguna sección destaca demasiado, para que aguante 12 minutos de repeticiones
- **Instrumentation**: Piano de juguete, marimba, cuerdas en pizzicato, fagot en staccato con frullato («brr, brr»), bloque de madera, bongos, palmas, melodía chiptune de onda cuadrada; zumbido fluorescente y cinta desafinada como capa liminal

<!-- SERVICE: suno -->
## Suno Inputs

### Style Box
*Copy this into Suno's "Style of Music" field:*

```
Cheerful co-op platformer game loop, 124 BPM, C major. Toy piano, marimba, pizzicato strings, bouncy staccato bassoon with flutter tongue, woodblock, bongos, handclaps, chiptune square lead. Liminal lo-fi: buzzing fluorescent hum, wobbly detuned tape, slightly wrong notes. Cute, playful, a bit creepy.
```

### Exclude Styles
*Paste into Suno's **Exclude Styles** field (Advanced Mode → More Options), not the Style Box. Bare elements, comma-separated — `drums, electric guitar` — never "no drums":*

```
vocals, choir, vocal chops, trap, rock drums, epic orchestral, heavy distortion
```

### Generation Settings
*Set these in Suno's Advanced Mode → More Options. Keep Variety Off so the Style Box above is used verbatim.*

| Setting | Value |
|---------|-------|
| **Model** | v6 |
| **Variety** | Off |
| **Max Mode** | On |
| **Vocal Gender** | — |
| **Duration** | 3:30 |
| **Weirdness** | 35 |
| **Style Influence** | 70 |

### Lyrics Box
*Copy this into Suno's "Lyrics" field:*

```
[Intro - buzzing fluorescent hum, toy piano pickup, 4 bars]

[Main Theme - bouncy co-op groove, marimba and toy piano melody]

[Groove B - same tempo, staccato bassoon brr brr flutter answers the melody]

[Main Theme - bouncy co-op groove, chiptune lead doubles, slightly detuned]

[Groove C - pizzicato strings and woodblock, tape wobble, one wrong note]

[Main Theme - bouncy co-op groove, handclaps]

[Loop Turnaround - same groove, no ending, no fade]

[End]
```
<!-- /SERVICE: suno -->

## Production Notes

- **Bucle**: desde el primer tiempo del primer [Main Theme] hasta el último compás completo del [Loop Turnaround]. El [Intro] con zumbido se puede dejar fuera del bucle o exportar como cabeza aparte; si se deja dentro, que sea solo la primera vez (punto de bucle después del intro).
- La sala dura ≈ 12 min: con un bucle de 3:00 se repite unas cuatro veces. Por eso no debe tener una sección estrella que canse; si una toma tiene un «momento» muy marcado, descartadla.
- Hay muchos SFX encima (`jump`, `blip`, `ring`, `open`, `fail`, `win`), casi todos tonos de onda cuadrada o triangular entre 380 Hz y 1,3 kHz. El chiptune de la música no debe tapar esa zona: si compite, bajadlo en la edición o elegid una toma con el chiptune más discreto.
- El «raro» tiene que ser sutil: cinta tambaleante y alguna nota fuera de sitio, no un ruido que distraiga en un juego de reflejos.
- **Suno settings**: Instrumental On, Max Mode On (3:30). Weirdness 35 y Style Influence 70: queremos un bucle estable y en estilo; lo liminal lo dan las descripciones.

## Generation Log

Mark keepers with ✓ in the Rating column. Checkpoint verification looks for at least one ✓ per track.

| # | Date | Model | Result | Notes | Rating |
|---|------|-------|--------|-------|--------|
| — | — | — | — | — | — |
