---
title: "Las Piscinas"
track_number: 6
instrumental: true
explicit: false
# genre: ""  # Optional: only when this track's genre differs from the album's
game_key: "room2_pools"
target_file: "static/audio/music/room2_pools.mp3"
loop: true
suno_url: ""
sheet_music:
  pdf: ""
  musicxml: ""
  midi: ""
---

# Las Piscinas

## Track Details

| Attribute | Detail |
|-----------|--------|
| **Track #** | 06 |
| **Title** | Las Piscinas |
| **Album** | [Backrooms del Brainrot](../README.md) |
| **Status** | In Progress |
| **Suno Link** | — |
| **Stems** | No |
| **Instrumental** | Yes |
| **Explicit** | No |
| **Game Key** | `room2_pools` |
| **Target File** | `static/audio/music/room2_pools.mp3` |
| **Loop** | Sí |
| **POV** | — (instrumental) |
| **Role** | Sala 2 (guardián: Tralalero Tralala): capa de «luz verde» de «Un, dos, tres… ¡Tralalero!», ≈ 10 min; también suena en la intro y la búsqueda del ancla. La capa de «luz roja» es la pista 07 |
| **Fade Out** | None (loop) |
| **Target Duration** | Generar 3:00; bucle exportado ≈ 2:40 |
| **Sources Verified** | N/A |

## Concept

Las Piscinas de las Backrooms: azulejos blancos infinitos, agua tibia que no refleja nada y una luz de sol que no viene de ningún sitio. La base es poolcore y vaporwave (pads de cristal, piano eléctrico con chorus, reverb de nave enorme, goteo de agua) cruzada con una tarantela italiana para Tralalero Tralala: mandolina en trémolo, acordeón y pandereta en 6/8, como una fiesta de pueblo grabada bajo el agua.

Es la música de «luz verde»: invita a nadar, se balancea y avanza. Cuando Tralalero se da la vuelta, el juego funde a la pista 07, que es esta misma sala conteniendo la respiración.

## Cross-References

### References TO This Track

| From Track | Reference Type | Detail |
|------------|---------------|--------|
| 07 | contrast | La «luz roja» es esta tarantela congelada: misma tonalidad y tempo, sin movimiento |

### References FROM This Track

| To Track | Reference Type | Lyric Line | Detail |
|----------|---------------|------------|--------|
| 02 | character | [Main Theme] | Tralalero Tralala, presentado en la cinemática nadando con sus Nike, tiene aquí su tarantela |

**Reference types:** `callback` (echoes earlier lyric/image), `motif` (recurring thematic element), `character` (same character reappears), `contrast` (deliberate inversion of earlier idea), `resolution` (resolves tension from earlier track)

<!-- END CROSS-REFERENCES -->

## Mood & Imagery

Toboganes que no llevan a ningún sitio, escaleras que bajan al agua y siguen bajando, carriles de natación con un bichito de color en cada uno. Tralalero al fondo, de espaldas, con sus Nike. Turquesa, blanco azulejo, rosa vaporwave. Sol de las 3 AM.

## Musical Direction

- **Tempo**: ~108 BPM en 6/8 (pulso de negra con puntillo), balanceo de tarantela tranquila
- **Key**: La menor; encaja con los SFX de la sala (`green` es un Do agudo, `red` un Re grave, `warn` dos La agudos)
- **Feel**: Flotante, soleado y extraño; se mueve hacia delante como una brazada, sin acelerar
- **Instrumentation**: Mandolina en trémolo, acordeón, pandereta, pads de cristal, piano eléctrico con chorus, reverb profunda, goteo de agua y eco de piscina cubierta, calidez de cinta ralentizada

<!-- SERVICE: suno -->
## Suno Inputs

### Style Box
*Copy this into Suno's "Style of Music" field:*

```
Dreamy poolcore vaporwave meets Italian tarantella, 6/8, 108 BPM, A minor. Mandolin tremolo, accordion, tambourine, glassy pads, chorus electric piano, deep reverb, water drips, echoing tiled indoor pool ambience, slowed tape warmth. Floaty, sunny, uncanny, swimming motion.
```

### Exclude Styles
*Paste into Suno's **Exclude Styles** field (Advanced Mode → More Options), not the Style Box. Bare elements, comma-separated — `drums, electric guitar` — never "no drums":*

```
vocals, choir, vocal chops, trap, heavy drums, distorted guitar, dubstep
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
| **Weirdness** | 40 |
| **Style Influence** | 65 |

### Lyrics Box
*Copy this into Suno's "Lyrics" field:*

```
[Intro - water drips, echoing pool ambience, glassy pads, 4 bars]

[Main Theme - gentle tarantella sway, mandolin tremolo melody, tambourine]

[Variation - accordion takes the melody, chorus electric piano underneath]

[Main Theme - gentle tarantella sway, deep reverb, slowed tape warmth]

[Variation - mandolin and accordion together, glassy pads shimmer]

[Main Theme - gentle tarantella sway, steady]

[Loop Turnaround - same groove, no ending, no fade]

[End]
```
<!-- /SERVICE: suno -->

## Production Notes

- **Bucle**: desde el primer tiempo del primer [Main Theme] hasta el último compás completo antes del [End]. Cortad al inicio de un compás de 6/8 (dos pulsos), nunca a mitad.
- **Pareja con la 07**: generad primero esta pista y elegid la toma buena; después generad la 07 con la misma tonalidad y tempo. Plan de mezcla para cuando se integre: esta capa sigue sonando durante la luz roja (bajada ≈ −12 dB y filtrada, como oída desde debajo del agua) y la 07 entra encima en 150–250 ms; al volver el verde, la 07 sale y esta recupera el volumen. Así nunca se pierde el sitio del bucle.
- Los falsos giros de Tralalero (se da media vuelta y vuelve a mirar al frente) los marca el juego: la música no debe tener paradas propias que se confundan con un rojo.
- **Suno settings**: Instrumental On, Max Mode On (3:00). Weirdness 40 para el punto raro del vaporwave; Style Influence 65.

## Generation Log

Mark keepers with ✓ in the Rating column. Checkpoint verification looks for at least one ✓ per track.

| # | Date | Model | Result | Notes | Rating |
|---|------|-------|--------|-------|--------|
| — | — | — | — | — | — |
