---
title: "Sahur dice"
track_number: 8
instrumental: true
explicit: false
# genre: ""  # Optional: only when this track's genre differs from the album's
game_key: "room7_sahur"
target_file: "static/audio/music/room7_sahur.mp3"
loop: true
suno_url: ""
sheet_music:
  pdf: ""
  musicxml: ""
  midi: ""
---

# Sahur dice

## Track Details

| Attribute | Detail |
|-----------|--------|
| **Track #** | 08 |
| **Title** | Sahur dice |
| **Album** | [Backrooms del Brainrot](../README.md) |
| **Status** | In Progress |
| **Suno Link** | — |
| **Stems** | No |
| **Instrumental** | Yes |
| **Explicit** | No |
| **Game Key** | `room7_sahur` |
| **Target File** | `static/audio/music/room7_sahur.mp3` |
| **Loop** | Sí |
| **POV** | — (instrumental) |
| **Role** | Sala 7, la final (guardián: Tung Tung Tung Sahur): Simon de tambores con trampas, ≈ 8 min, y búsqueda del ancla de salida |
| **Fade Out** | None (loop) |
| **Target Duration** | Generar 2:45; bucle exportado ≈ 2:20 |
| **Sources Verified** | N/A |

## Concept

*Tung. Tung. Tung.* El jefe final. En Indonesia, durante el Ramadán, grupos de vecinos recorren las calles de madrugada tocando kentongan (tambores de bambú hueco) y bedug para despertar a la gente para el sahur, la comida de antes del amanecer. Tung Tung Tung Sahur es ese despertador convertido en monstruo de madera con un palo.

La pista mezcla esos patrones de madera y bambú con trap de terror: un sub profundo, charles en tresillos, campanas de gamelán desafinadas y grillos nocturnos. Todo gira alrededor del motivo de la llamada que lleva sonando desde el lobby: tres golpes iguales de madera y una pausa. Aquí ya no está lejos: está al otro lado de la pantalla.

## Cross-References

### References TO This Track

| From Track | Reference Type | Detail |
|------------|---------------|--------|
| 09 | resolution | «Sahur, cuelga el teléfono»: el final bueno deja la llamada sin contestar |
| 10 | motif | La nevera hace «tung, tung, tung»: el motivo se cuela en casa |

### References FROM This Track

| To Track | Reference Type | Lyric Line | Detail |
|----------|---------------|------------|--------|
| 01 | motif | [Breakdown] | Los tres golpes lejanos del hilo musical del lobby |
| 02 | resolution | [Intro] | Se cumple el aviso del puente: «a las cuatro y media hace su llamada» |
| 03 | motif | [Main Loop] | Los tres golpes bajo el pulso del prólogo, ahora como ritmo principal |

**Reference types:** `callback` (echoes earlier lyric/image), `motif` (recurring thematic element), `character` (same character reappears), `contrast` (deliberate inversion of earlier idea), `resolution` (resolves tension from earlier track)

<!-- END CROSS-REFERENCES -->

## Mood & Imagery

Una calle de madrugada vista a través de la pantalla. Una silueta de madera alta con un palo, golpeando el cristal desde dentro. Tambores numerados en la tele, cada uno con el nombre de quien lo toca. El reloj de la tele cerca de las 4:30. Luz de farola naranja, sombras largas.

## Musical Direction

- **Tempo**: ~140 BPM a medio tiempo (se siente a 70), constante
- **Key**: La menor. Los SFX de los tambores del juego son tonos sinusoidales de ≈110 a 263 Hz que forman un arpegio disminuido sobre La (La, Do, Mi♭, Fa♯): en La menor «pertenecen» a la pista
- **Feel**: Escaso, amenazante e hipnótico; deja huecos. Nada de drop ni subidones: la tensión la pone el puzzle
- **Instrumentation**: Kentongan (tambor de bambú) en patrones de llamada y respuesta, bedug en los tiempos fuertes, angklung, charles en tresillos nítidos, dron de sub profundo, campanas de gamelán inquietantes, grillos; motivo de tres golpes de madera

<!-- SERVICE: suno -->
## Suno Inputs

### Style Box
*Copy this into Suno's "Style of Music" field:*

```
Dark horror trap, 140 BPM half-time, A minor. Indonesian kentongan bamboo slit drum patterns, bedug drum on the downbeat, angklung, crisp triplet hi-hats, deep sub bass drone, eerie detuned gamelan bells, night crickets. Repeating three-knock wooden motif. Sparse, menacing, hypnotic, steady.
```

### Exclude Styles
*Paste into Suno's **Exclude Styles** field (Advanced Mode → More Options), not the Style Box. Bare elements, comma-separated — `drums, electric guitar` — never "no drums":*

```
vocals, rap, choir, tom fills, taiko, EDM drop, guitar
```

### Generation Settings
*Set these in Suno's Advanced Mode → More Options. Keep Variety Off so the Style Box above is used verbatim.*

| Setting | Value |
|---------|-------|
| **Model** | v6 |
| **Variety** | Off |
| **Max Mode** | On |
| **Vocal Gender** | — |
| **Duration** | 2:45 |
| **Weirdness** | 40 |
| **Style Influence** | 70 |

### Lyrics Box
*Copy this into Suno's "Lyrics" field:*

```
[Intro - night crickets, three slow wooden knocks, sub drone]

[Main Loop - kentongan bamboo pattern, crisp triplet hi-hats, sparse half-time trap]

[Variation - bedug on the downbeat, eerie gamelan bells answer]

[Main Loop - kentongan call and response, angklung shimmer]

[Breakdown - drums drop out, only sub drone and three slow wooden knocks]

[Main Loop - full pattern returns, steady, no drop]

[Loop Turnaround - same groove, no ending, no fade]

[End]
```
<!-- /SERVICE: suno -->

## Production Notes

- **Bucle**: desde el primer tiempo del primer [Main Loop] hasta el último compás completo antes del [End]. El [Intro] con grillos y tres golpes puede quedar como cabeza que solo suena una vez.
- **Ojo con el puzzle**: en «Sahur dice» la tele toca la secuencia con el SFX `drum` (seno con caída de tono, como un tom 808) y el grupo tiene que oírla y repetirla. Si la música lleva toms o 808 tonales en esa zona, tapa la secuencia y confunde a los jugadores. Por eso el ritmo va en madera, bambú y metal (kentongan, charles, campanas), que suenan distintos a un seno, y se excluyen `tom fills` y `taiko`. Si una toma trae toms graves con ritmo, descartadla.
- Plan de mezcla para cuando se integre (no es código de ahora): bajar la música ≈ −12 dB (o filtrarla) mientras la tele toca la secuencia y mientras el grupo la repite, y devolverla entre rondas.
- Los tres golpes del motivo no deben sonar como los tambores del juego: tienen que ser madera seca (kentongan), no tonos graves.
- **Suno settings**: Instrumental On, Max Mode On (2:45). Exclude `rap`: el trap invita a meter voces. Weirdness 40 para lo inquietante del gamelán; Style Influence 70.

## Generation Log

Mark keepers with ✓ in the Rating column. Checkpoint verification looks for at least one ✓ per track.

| # | Date | Model | Result | Notes | Rating |
|---|------|-------|--------|-------|--------|
| — | — | — | — | — | — |
