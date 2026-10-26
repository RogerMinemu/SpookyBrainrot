---
title: "¡Luz roja!"
track_number: 7
instrumental: true
explicit: false
# genre: ""  # Optional: only when this track's genre differs from the album's
game_key: "room2_red"
target_file: "static/audio/music/room2_red.mp3"
loop: true
suno_url: ""
sheet_music:
  pdf: ""
  musicxml: ""
  midi: ""
---

# ¡Luz roja!

## Track Details

| Attribute | Detail |
|-----------|--------|
| **Track #** | 07 |
| **Title** | ¡Luz roja! |
| **Album** | [Backrooms del Brainrot](../README.md) |
| **Status** | In Progress |
| **Suno Link** | — |
| **Stems** | No |
| **Instrumental** | Yes |
| **Explicit** | No |
| **Game Key** | `room2_red` |
| **Target File** | `static/audio/music/room2_red.mp3` |
| **Loop** | Sí (capa corta) |
| **POV** | — (instrumental) |
| **Role** | Sala 2: capa de «luz roja». El juego funde a ella cuando Tralalero se gira y vuelve a `room2_pools` con el verde |
| **Fade Out** | None (loop) |
| **Target Duration** | Generar 1:00; bucle exportado ≈ 0:30–0:45 |
| **Sources Verified** | N/A |

## Concept

Tralalero se ha dado la vuelta. Nadie se mueve. Esta capa es la piscina conteniendo la respiración: la tarantela de la pista 06 congelada en un acorde que no se resuelve, un racimo de cuerdas agudas sostenido, un dron de acordeón que no respira, un reloj que hace tictac y la pandereta temblando apenas, como una mano que no se atreve a estarse quieta. Todo suena amortiguado, como si tuvierais la cabeza bajo el agua.

No tiene melodía ni pulso marcado a propósito: así el juego puede entrar en cualquier momento sin que se note desfase con el bucle verde.

## Cross-References

### References TO This Track

| From Track | Reference Type | Detail |
|------------|---------------|--------|
| — | — | — |

### References FROM This Track

| To Track | Reference Type | Lyric Line | Detail |
|----------|---------------|------------|--------|
| 06 | contrast | [Main Loop] | La tarantela de las Piscinas congelada: misma tonalidad y tempo, sin movimiento |

**Reference types:** `callback` (echoes earlier lyric/image), `motif` (recurring thematic element), `character` (same character reappears), `contrast` (deliberate inversion of earlier idea), `resolution` (resolves tension from earlier track)

<!-- END CROSS-REFERENCES -->

## Mood & Imagery

La luz de la tele en rojo. Diez bichitos congelados a mitad de brazada. Tralalero mirándoos de frente, con las Nike chorreando. Una gota que cae del techo y tarda demasiado en llegar al agua.

## Musical Direction

- **Tempo**: ~108 BPM (el mismo que la 06), pero sin batería: solo el tictac lo deja entrever
- **Key**: La menor (la misma que la 06), racimo sostenido sobre La
- **Feel**: Suspendido, tenso, «que nadie se mueva»; sin melodía, sin golpes, sin drop
- **Instrumentation**: Racimo de cuerdas agudas sostenido, dron de acordeón, tictac de reloj, pandereta temblando muy bajo, latido grave, eco de piscina amortiguado como bajo el agua

<!-- SERVICE: suno -->
## Suno Inputs

### Style Box
*Copy this into Suno's "Style of Music" field:*

```
Tense suspended horror underscore, 108 BPM, A minor. Held high string cluster, frozen accordion drone, ticking clock, faint trembling tambourine, low heartbeat, muffled underwater indoor pool echo. Hold your breath, nobody moves. Static, no melody.
```

### Exclude Styles
*Paste into Suno's **Exclude Styles** field (Advanced Mode → More Options), not the Style Box. Bare elements, comma-separated — `drums, electric guitar` — never "no drums":*

```
vocals, choir, lead melody, drum groove, bass drop, guitar
```

### Generation Settings
*Set these in Suno's Advanced Mode → More Options. Keep Variety Off so the Style Box above is used verbatim.*

| Setting | Value |
|---------|-------|
| **Model** | v6 |
| **Variety** | Off |
| **Max Mode** | Off |
| **Vocal Gender** | — |
| **Duration** | 1:00 |
| **Weirdness** | 35 |
| **Style Influence** | 75 |

### Lyrics Box
*Copy this into Suno's "Lyrics" field:*

```
[Intro - held high string cluster swells in fast]

[Main Loop - frozen accordion drone, ticking clock, faint trembling tambourine]

[Main Loop - low heartbeat joins, muffled underwater echo, same tension]

[Loop Turnaround - same held cluster, no ending, no fade]

[End]
```
<!-- /SERVICE: suno -->

## Production Notes

- **Bucle**: un tramo de 30–45 s del [Main Loop] con el racimo ya sostenido. El [Intro] no entra: el fundido de entrada lo hace el juego (150–250 ms). Como no hay pulso, la costura solo necesita un fundido cruzado de 30–50 ms.
- **Generadla después de la 06** y comprobad que suenan bien juntas: poned las dos a la vez en el editor (la 06 a −12 dB y filtrada) y escuchad si el racimo choca. Si choca, regenerad la 07, no la 06.
- **Alternativa**: generar la 07 como Cover de la toma buena de la 06 (Suno Cover, con este Style Box) para heredar instrumentos y armonía. Sale más parecida, pero más difícil de dejar sin pulso; probadla solo si la generación normal suena ajena a la 06.
- Los SFX `red` (Re grave en diente de sierra) y `warn` suenan encima: la capa no debe tener golpes graves que se confundan con ellos.
- **Suno settings**: Instrumental On, Max Mode Off (1:00). Style Influence 75 para que respete «static, no melody».

## Generation Log

Mark keepers with ✓ in the Rating column. Checkpoint verification looks for at least one ✓ per track.

| # | Date | Model | Result | Notes | Rating |
|---|------|-------|--------|-------|--------|
| — | — | — | — | — | — |
