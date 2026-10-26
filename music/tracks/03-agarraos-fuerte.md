---
title: "Agarraos fuerte"
track_number: 3
instrumental: true
explicit: false
# genre: ""  # Optional: only when this track's genre differs from the album's
game_key: "prologue"
target_file: "static/audio/music/prologue.mp3"
loop: true
suno_url: ""
sheet_music:
  pdf: ""
  musicxml: ""
  midi: ""
---

# Agarraos fuerte

## Track Details

| Attribute | Detail |
|-----------|--------|
| **Track #** | 03 |
| **Title** | Agarraos fuerte |
| **Album** | [Backrooms del Brainrot](../README.md) |
| **Status** | In Progress |
| **Suno Link** | — |
| **Stems** | No |
| **Instrumental** | Yes |
| **Explicit** | No |
| **Game Key** | `prologue` |
| **Target File** | `static/audio/music/prologue.mp3` |
| **Loop** | Sí |
| **POV** | — (instrumental) |
| **Role** | Puzzle de la Sala 0: todos mantienen pulsado el botón 5 s a la vez; si uno suelta, se reinicia. Suena hasta que lo logran y salta el `noclip` |
| **Fade Out** | None (loop) |
| **Target Duration** | Generar 2:00; bucle exportado ≈ 1:30–1:45 |
| **Sources Verified** | N/A |

## Concept

El momento justo antes de caer. La megafonía acaba de gritar «¡Agarraos fuerte!» y el grupo tiene que sincronizarse: todos con el dedo en el botón, nadie suelta. La música no puede «llegar» a ningún sitio, porque el puzzle se reinicia cada vez que alguien falla, así que es una tensión que sube sin parar y nunca termina: pads en escala de Shepard (la ilusión de un tono que sube eternamente), un latido de bombo y un reloj que hace tictac.

Por debajo, el zumbido de los fluorescentes ya se oye más cerca que en el lobby, y cada pocos compases suenan los tres golpes de madera de la llamada del Sahur. Esta vez no están lejos.

## Cross-References

### References TO This Track

| From Track | Reference Type | Detail |
|------------|---------------|--------|
| 08 | motif | Los tres golpes de madera bajo el pulso del prólogo son el núcleo rítmico de la Sala 7 |

### References FROM This Track

| To Track | Reference Type | Lyric Line | Detail |
|----------|---------------|------------|--------|
| 02 | callback | — (título) | El grito final de la cinemática, «¡Agarraos fuerte!», da nombre a este bucle y lo arranca |

**Reference types:** `callback` (echoes earlier lyric/image), `motif` (recurring thematic element), `character` (same character reappears), `contrast` (deliberate inversion of earlier idea), `resolution` (resolves tension from earlier track)

<!-- END CROSS-REFERENCES -->

## Mood & Imagery

El salón real, pero con la luz parpadeando. Diez dedos sobre diez pantallas. La imagen de la tele que se estira y se arruga como una cortina. El suelo que de repente parece moqueta. Una grieta en la realidad que se abre un poco más cada segundo que aguantáis.

## Musical Direction

- **Tempo**: ~100 BPM, pulso constante (latido en negras), sin cambios de tempo
- **Key**: La menor, sobre un pedal de La en el grave
- **Feel**: Tensión suspendida e hipnótica; sube sin llegar nunca, sin drop ni clímax, para que el bucle no tenga «final»
- **Instrumentation**: Pads en escala de Shepard, bombo latido, tictac de reloj, zumbido fluorescente, dron de sub, barridos invertidos, tres golpes de madera lentos

<!-- SERVICE: suno -->
## Suno Inputs

### Style Box
*Copy this into Suno's "Style of Music" field:*

```
Dark ambient horror pulse, 100 BPM, A minor. Endless rising Shepard tone pads, heartbeat kick, ticking clock, buzzing fluorescent hum, sub bass drone, reversed swells, three slow wooden knocks. Tense, suspended, hypnotic, steady.
```

### Exclude Styles
*Paste into Suno's **Exclude Styles** field (Advanced Mode → More Options), not the Style Box. Bare elements, comma-separated — `drums, electric guitar` — never "no drums":*

```
vocals, choir, lead melody, trailer hits, dubstep, guitar
```

### Generation Settings
*Set these in Suno's Advanced Mode → More Options. Keep Variety Off so the Style Box above is used verbatim.*

| Setting | Value |
|---------|-------|
| **Model** | v6 |
| **Variety** | Off |
| **Max Mode** | Off |
| **Vocal Gender** | — |
| **Duration** | 2:00 |
| **Weirdness** | 35 |
| **Style Influence** | 70 |

### Lyrics Box
*Copy this into Suno's "Lyrics" field:*

```
[Intro - fluorescent hum fades in, ticking clock, 4 bars]

[Main Loop - heartbeat kick, rising Shepard tone pads, sub drone]

[Main Loop - three slow wooden knocks between phrases, same intensity]

[Variation - reversed swells, pads keep rising, never resolving]

[Main Loop - heartbeat kick, rising Shepard tone pads, three slow wooden knocks]

[Loop Turnaround - same pulse, no ending, no fade]

[End]
```
<!-- /SERVICE: suno -->

## Production Notes

- **Bucle**: desde el primer tiempo del primer [Main Loop] hasta el último compás completo antes del [End]. Como no hay melodía, la costura es fácil: cortad en un latido.
- Que no «llegue»: si Suno mete un clímax o un golpe de tráiler, regenerad. El clímax lo pone el juego con el `noclip` cuando el grupo lo consigue.
- Idea para cuando se integre (no es código de ahora): con todos pulsando, el juego puede ir abriendo un filtro paso bajo o subir el volumen; si alguien suelta, el filtro vuelve a cerrarse. El bucle debe sonar bien tanto filtrado como abierto.
- Max Mode Off: dura 2:00 y es ambiente, no compensa el doble de créditos. Weirdness 35 y Style Influence 70 para un resultado estable y repetible.
- **Suno settings**: Instrumental On.

## Generation Log

Mark keepers with ✓ in the Rating column. Checkpoint verification looks for at least one ✓ per track.

| # | Date | Model | Result | Notes | Rating |
|---|------|-------|--------|-------|--------|
| — | — | — | — | — | — |
