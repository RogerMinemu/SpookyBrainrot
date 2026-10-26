---
title: "Espere, por favor"
track_number: 1
instrumental: true
explicit: false
# genre: ""  # Optional: only when this track's genre differs from the album's
game_key: "lobby"
target_file: "static/audio/music/lobby.mp3"
loop: true
suno_url: ""
sheet_music:
  pdf: ""
  musicxml: ""
  midi: ""
---

# Espere, por favor

## Track Details

| Attribute | Detail |
|-----------|--------|
| **Track #** | 01 |
| **Title** | Espere, por favor |
| **Album** | [Backrooms del Brainrot](../README.md) |
| **Status** | In Progress |
| **Suno Link** | — |
| **Stems** | No |
| **Instrumental** | Yes |
| **Explicit** | No |
| **Game Key** | `lobby` |
| **Target File** | `static/audio/music/lobby.mp3` |
| **Loop** | Sí: la costura cae en el «ding» del ascensor |
| **POV** | — (instrumental) |
| **Role** | Sala de espera: suena en el lobby mientras los jugadores escanean el QR de la tele y ponen su nombre |
| **Fade Out** | None (loop) |
| **Target Duration** | Generar 3:00; bucle exportado ≈ 2:30–2:45 |
| **Sources Verified** | N/A |

## Concept

Hilo musical de ascensor, del que suena en una planta que no existe. Empieza amable y educado (bossa de sala de espera, vibráfono, Rhodes), pero en cada vuelta se estropea un poco más: la cinta se arrastra, una nota sale torcida, la melodía se desinfla y por debajo asoma el zumbido de los fluorescentes. Al fondo, muy lejos, suenan tres golpes de madera: es la primera vez que se oye la llamada del Sahur, y casi nadie se dará cuenta.

Justo cuando todo está a punto de romperse, suena el «ding» del ascensor y la música vuelve a estar perfecta, como si no hubiera pasado nada. Ese «ding» es la costura del bucle: el lobby puede durar lo que haga falta sin que se note el corte, y la propia vuelta a la normalidad ya da mal rollo.

## Cross-References

### References TO This Track

| From Track | Reference Type | Detail |
|------------|---------------|--------|
| 04 | motif | El zumbido fluorescente y los tres golpes de madera vuelven al aterrizar en las Backrooms |
| 08 | motif | Los tres golpes lejanos del [Breakdown] son la llamada del Sahur que manda en la Sala 7 |
| 10 | callback | La caja de música toca la melodía del hilo musical: volver a casa suena a esta sala de espera |
| 11 | callback | Un sample deformado y ralentizado de esta melodía aparece en el puente del final malo |

### References FROM This Track

| To Track | Reference Type | Lyric Line | Detail |
|----------|---------------|------------|--------|
| — | — | — | Abre el álbum: aquí nacen la melodía del hilo musical, el zumbido y los tres golpes |

**Reference types:** `callback` (echoes earlier lyric/image), `motif` (recurring thematic element), `character` (same character reappears), `contrast` (deliberate inversion of earlier idea), `resolution` (resolves tension from earlier track)

<!-- END CROSS-REFERENCES -->

## Mood & Imagery

El vestíbulo de un hotel a las 3:00: moqueta beige, plantas de plástico, un ascensor con espejo dorado que no tiene botón para vuestra planta. En la tele del salón, el QR y los nombres que van apareciendo uno a uno. Colores crema y amarillo pálido que, vuelta a vuelta, se ponen verdosos como una foto vieja.

## Musical Direction

- **Tempo**: ~92 BPM, bossa en 4/4
- **Key**: Fa mayor; el «ding» y la vuelta a la normalidad caen en la tónica
- **Feel**: Muzak educado e inofensivo que se pudre por ciclos: limpio → desafinado → casi roto → «ding» → limpio otra vez
- **Instrumentation**: Vibráfono (melodía del hilo musical), Rhodes cálido, flauta suave, contrabajo, batería con escobillas; la degradación llega con wow y flutter de cinta, notas desafinadas y zumbido fluorescente; tres golpes de madera lejanos en la parte rota
- **Leitmotif**: La melodía del hilo musical es una frase de 4 compases en el vibráfono, sencilla y tarareable. Vuelve en la 10 (caja de música) y en la 11 (sample deformado)

<!-- SERVICE: suno -->
## Suno Inputs

### Style Box
*Copy this into Suno's "Style of Music" field:*

```
Elevator muzak, lounge bossa nova, 92 BPM, F major. Vibraphone melody, warm Rhodes, soft flute, upright bass, brushed drums. Polite and pleasant, then tape warble, detuned wrong notes and buzzing fluorescent hum creep in. Liminal, uncanny, lo-fi.
```

### Exclude Styles
*Paste into Suno's **Exclude Styles** field (Advanced Mode → More Options), not the Style Box. Bare elements, comma-separated — `drums, electric guitar` — never "no drums":*

```
vocals, choir, humming, trap, distorted guitar, heavy drums
```

### Generation Settings
*Set these in Suno's Advanced Mode → More Options. Keep Variety Off so the Style Box above is used verbatim.*

| Setting | Value |
|---------|-------|
| **Model** | v6 |
| **Variety** | Off |
| **Max Mode** | On |
| **Vocal Gender** | — |
| **Duration** | 3:00 |
| **Weirdness** | 45 |
| **Style Influence** | 65 |

### Lyrics Box
*Copy this into Suno's "Lyrics" field:*

```
[Intro - elevator chime ding, soft brushed bossa, 2 bars]

[Main Theme - smooth lounge bossa, vibraphone melody, warm Rhodes]

[Main Theme - flute doubles the melody, still polite and pleasant]

[Variation - tape warble creeps in, one wrong note, slightly detuned]

[Variation - melody slows and sags, fluorescent hum grows louder]

[Breakdown - warped and dissonant, music almost stops, three distant wooden knocks]

[Turnaround - elevator chime ding, music snaps back to normal]

[Main Theme - smooth lounge bossa, clean again]

[End]
```
<!-- /SERVICE: suno -->

## Production Notes

- **Bucle**: desde el primer «ding» (el tiempo fuerte del [Intro]) hasta justo antes del segundo «ding» del [Turnaround]. Cortad en línea de compás y sin fundido; si chasca, fundido cruzado de 10–30 ms en la costura. El [Main Theme] final y el [End] se descartan.
- **Si Suno no pone el «ding»** (pasa a menudo): cortad en el primer tiempo de un [Main Theme] limpio. El SFX `ring` del juego (dos notas sinusoidales agudas) ya suena a timbre de ascensor y puede tapar la costura.
- Los tres golpes de madera tienen que quedar lejos y bajos: es un aviso, no un susto. Si salen en primer plano, regenerad.
- Mezcla: no hay narración encima, pero sí los «blips» de los móviles al unirse (≈660 Hz). Si la flauta tapa esa zona, bajadla en la edición.
- **Suno settings**: Instrumental On, Max Mode On (más de 2:00), Variety Off. Weirdness 45: queremos que se tuerza un poco, no que se rompa del todo. Style Influence 65 para que no pierda la bossa.

## Generation Log

Mark keepers with ✓ in the Rating column. Checkpoint verification looks for at least one ✓ per track.

| # | Date | Model | Result | Notes | Rating |
|---|------|-------|--------|-------|--------|
| — | — | — | — | — | — |
