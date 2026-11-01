// The story, as pure data (no DOM, no clock). The TV plays it (tv/story.js) and the phones read the same lines
// (play/story.js), so the text never travels over the socket: the TV only says which beat it is on.
//
// A scene is { title?, cast: [ids on stage], beats }. A beat is either a line or a title card:
//   line: { who, text, emote?, show?, shake?, sfx?, via?, riddle? }
//   card: { card: "Título", sfx? }
// who:    "fundacion" (the off-screen terminal voice) or a roster id (art/roster.js).
// emote:  idle, talk, happy, angry, surprised, scary (the cameo sprites only have idle and scary poses).
// show:   "lineup" (the 8 brainrots in a row), "meter" (the Brainrot bar), "alarm" (red rotating light).
// via:    "phone" (the speaker calls in from a phone frame; Sahur does this before his room).
// riddle: true -> the text is the house riddle of the anchor ({riddle}).
// Vars:   {count} = connected players, {riddle} = the anchor's riddle.
//
// Story keys (runner.storyKeyFor): intro:<room>, search:<room>, unlocked:<room>, ending:<band>.
// Spain Spanish (vosotros), full tildes: tests/test_pages.py sweeps this file.

/** Verbatim copy of app/content.py RIDDLE_PLACEHOLDER (a pytest keeps them equal). */
export const RIDDLE_PLACEHOLDER = "La pista aún no ha sido escrita... buscad el QR por vuestra cuenta.";

/** Display names. The brainrots use their roster/CAMEOS name. */
export const SPEAKERS = {
  fundacion: "La Fundación",
  patapim: "Brr Brr Patapim",
  tralalero: "Tralalero Tralala",
  sahur: "Tung Tung Tung Sahur",
  bombardiro: "Bombardiro Crocodilo",
  ballerina: "Ballerina Cappuccina",
  lirili: "Lirilì Larilà",
  chimpanzini: "Chimpanzini Bananini",
  trippi: "Trippi Troppi",
};

/**
 * Talking voices: one short synth blip per revealed letter. cps = letters per second of the typewriter.
 * { type, freq, dur, slide, vol, cps }
 */
export const VOICES = {
  fundacion: { type: "square", freq: 1760, dur: 0.018, slide: 0, vol: 0.12, cps: 40 },
  patapim: { type: "triangle", freq: 150, dur: 0.07, slide: 20, vol: 0.5, cps: 28 },
  tralalero: { type: "sine", freq: 560, dur: 0.06, slide: 90, vol: 0.4, cps: 34 },
  sahur: { type: "square", freq: 196, dur: 0.06, slide: -30, vol: 0.22, cps: 26 },
  bombardiro: { type: "sawtooth", freq: 110, dur: 0.07, slide: 15, vol: 0.25, cps: 30 },
  ballerina: { type: "sine", freq: 990, dur: 0.05, slide: 40, vol: 0.3, cps: 32 },
  lirili: { type: "triangle", freq: 330, dur: 0.06, slide: -40, vol: 0.45, cps: 30 },
  chimpanzini: { type: "square", freq: 720, dur: 0.05, slide: 160, vol: 0.18, cps: 36 },
  trippi: { type: "sine", freq: 620, dur: 0.06, slide: -60, vol: 0.35, cps: 32 },
};

const say = (who, text, o = {}) => ({ who, text, ...o });
const card = (text, o = {}) => ({ card: text, ...o });
const riddle = (who) => ({ who, text: "{riddle}", riddle: true, emote: "talk" });

export const SCENES = {
  // ---------------------------------------------------------------- room 0: the Foundation explains the game
  prologue: {
    title: "Prólogo", cast: [],
    beats: [
      card("3:00 AM", { sfx: "warn" }),
      say("fundacion", "Conexión establecida. Detecto {count} conciencias despiertas a las tres de la mañana. Mala hora."),
      say("fundacion", "Os habla la Fundación. Tenemos un fallo de contención en las Backrooms del Brainrot, y vuestro salón está justo encima.", { show: "alarm" }),
      say("fundacion", "Los brainrots se han escapado de sus celdas. Cada uno se ha adueñado de un nivel... y os está esperando.", { show: "lineup" }),
      say("fundacion", "Vuestros móviles serán vuestros mandos y lo único que os ata a la realidad. No los soltéis."),
      say("fundacion", "En cada nivel, su guardián os pondrá a prueba. Superadla y os dará una pista."),
      say("fundacion", "La pista lleva a un Ancla de Realidad: un QR de verdad, escondido en esta casa. Escaneadlo con la cámara del móvil y se abrirá la puerta."),
      say("fundacion", "Cuidado: también hay QR trampa. Cada error os sube el Brainrot. Si llega arriba, os quedáis allí para siempre.", { show: "meter" }),
      say("sahur", "Tung, tung, tung... ¡Sahur! A las cuatro y media paso a recoger a los que sigan ahí.", { via: "phone", emote: "happy", sfx: "warn" }),
      say("fundacion", "Esa llamada no es posible. Ignoradla. Primero, lo primero: hay que bajar."),
      card("Sala 0 · Agarraos fuerte"),
      say("fundacion", "Todos con el dedo en el móvil a la vez, y que nadie suelte. Cuando estéis listos, pulsad «Entrar»."),
    ],
  },
  noclip: {
    title: "Noclip", cast: [],
    beats: [
      say("fundacion", "Lo habéis conseguido. La realidad cede bajo vuestros pies...", { shake: true }),
      say("fundacion", "No soltéis el móvil. ¡Que vamos para abajo!", { shake: true, sfx: "fail" }),
      card("Noclip"),
      say("fundacion", "Caída completada. Bienvenidos al Nivel 0. Pulsad «Siguiente sala» cuando os atreváis."),
    ],
  },

  // ---------------------------------------------------------------- room 1: Patapim, Level 0
  intro_1: {
    title: "Nivel 0", cast: ["patapim"],
    beats: [
      card("Nivel 0 · Las habitaciones amarillas"),
      say("fundacion", "Nivel 0. Moqueta húmeda, zumbido de fluorescentes y seiscientos millones de habitaciones vacías."),
      say("patapim", "¡Brr brr patapim! Ecco, visitas. Hacía años que nadie pisaba mi moqueta.", { emote: "happy" }),
      say("patapim", "Mis pies llevan tanto tiempo aquí que ya son raíces. Yo no me puedo mover... pero vosotros sí."),
      say("patapim", "Cada uno es un bichito de su color. Moveos con el móvil y saltad unos encima de otros."),
      say("patapim", "La puerta solo se abre si llegáis todos. Allora: torre humana, botón pesado, plataforma y llave."),
      say("patapim", "Y si alguien se cae al vacío, vuelve al principio. El vacío siempre cobra. Brr.", { emote: "angry" }),
    ],
  },
  riddle_1: {
    cast: ["patapim"],
    beats: [
      say("patapim", "Bravissimi. La moqueta me ha chivado dónde duerme vuestra ancla. Escuchad bien:", { emote: "happy" }),
      riddle("patapim"),
      say("patapim", "Buscad ese QR por la casa y escaneadlo con la cámara del móvil. Yo os espero aquí. Tampoco tengo otra opción."),
    ],
  },
  riddle_1_none: {
    cast: ["patapim"],
    beats: [
      say("patapim", "Mamma mia... nadie ha escrito la pista de esta ancla. La moqueta no se acuerda de nada.", { emote: "surprised" }),
      say("patapim", "Tendréis que buscar el QR a ojo y escanearlo con el móvil. Y no escaneéis cualquier cosa: algunos muerden."),
    ],
  },
  exit_1: {
    cast: ["patapim"],
    beats: [
      say("patapim", "¡Brr brr! La puerta está abierta. Huele a cloro... eso son las Piscinas.", { emote: "happy" }),
      say("patapim", "Allí manda Tralalero. Es simpático, pero tiene tres patas y ninguna paciencia."),
      say("patapim", "Saludadle de mi parte. Y no le miréis las zapatillas: se pone celoso."),
    ],
  },

  // ---------------------------------------------------------------- room 2: Tralalero, the Poolrooms
  intro_2: {
    title: "Las Piscinas", cast: ["tralalero"],
    beats: [
      card("Las Piscinas"),
      say("fundacion", "Las Piscinas. Azulejos infinitos y un agua que no refleja nada. No miréis al fondo."),
      say("tralalero", "¡Tralalero tralalá! Benvenuti a mi piscina, ragazzi. Me encantan las visitas: nadan tan despacito...", { emote: "happy" }),
      say("tralalero", "Jugamos a un, dos, tres. Con luz verde, nadad. Con luz roja, quietos como estatuas."),
      say("tralalero", "Si os veo mover una aleta cuando me giro, volvéis a la salida. Y me giro muy rápido.", { emote: "angry" }),
      say("tralalero", "A veces finjo que me giro. Y los que lleguen pueden distraerme un ratito. No os fiéis de mis zapatillas.", { emote: "happy" }),
    ],
  },
  riddle_2: {
    cast: ["tralalero"],
    beats: [
      say("tralalero", "Habéis nadado bien. Casi me dais pena. Esta es la pista de vuestra ancla:"),
      riddle("tralalero"),
      say("tralalero", "Corred a escanear ese QR con el móvil. Pero sin salpicar, que luego resbala. Tralalá.", { emote: "happy" }),
    ],
  },
  riddle_2_none: {
    cast: ["tralalero"],
    beats: [
      say("tralalero", "Tralalá... el agua se ha llevado la pista de esta ancla. No hay nada escrito.", { emote: "surprised" }),
      say("tralalero", "Buscad el QR a vuestra manera. Y cuidado con los QR trampa: no todos son tan simpáticos como yo."),
    ],
  },
  exit_2: {
    cast: ["tralalero"],
    beats: [
      say("tralalero", "¡Tralalá! Habéis salido secos. Casi.", { emote: "happy" }),
      say("tralalero", "Esa escalera sube a un centro comercial vacío. Allí todos los relojes marcan las tres."),
      say("tralalero", "Es cosa de Lirilì Larilà. Lleva siglos parando el tiempo para no llegar tarde a ningún sitio. No le pidáis la hora.", { emote: "angry" }),
    ],
  },

  // ---------------------------------------------------------------- room 3: Lirilì, the 3 AM mall
  intro_3: {
    title: "Centro comercial", cast: ["lirili"],
    beats: [
      card("Centro comercial de las 3 AM"),
      say("fundacion", "Centro comercial abandonado. Hilo musical a cámara lenta. Todos los relojes, parados a las tres."),
      say("lirili", "Lirilì larilà... ¡Clientes! Hacía siglos que no entraba nadie. Literalmente siglos: los relojes los paré yo."),
      say("lirili", "Si queréis que el tiempo vuelva a andar, ayudadme con el inventario. Me he liado contando."),
      say("lirili", "A cada uno le toca una forma. En la tele saldrán un montón: contad solo la vuestra. El color da igual."),
      say("lirili", "Marcadlo en el móvil con más y menos antes de que acabe el tiempo. Si alguien se equivoca, a contar otra vez."),
      say("lirili", "Y en la última ronda las formas se mueven. No me miréis así: yo también me aburro.", { emote: "scary" }),
    ],
  },
  riddle_3: {
    cast: ["lirili"],
    beats: [
      say("lirili", "Inventario cuadrado. Los relojes vuelven a hacer tictac. A cambio, os digo dónde está vuestra ancla:"),
      riddle("lirili"),
      say("lirili", "Escanead ese QR con la cámara del móvil antes de que se me vuelva a parar el tiempo."),
    ],
  },
  riddle_3_none: {
    cast: ["lirili"],
    beats: [
      say("lirili", "Tic... tac... nadie ha escrito la pista de esta ancla. Ni con todo el tiempo del mundo me la sé."),
      say("lirili", "Buscad el QR por la casa y escaneadlo con el móvil. Y si un QR os mira raro, dejadlo en paz."),
    ],
  },
  exit_3: {
    cast: ["lirili"],
    beats: [
      say("lirili", "Lirilà. El ascensor de servicio baja al Sitio-19, el archivo de la Fundación."),
      say("lirili", "Allí os espera Ballerina Cappuccina con su concurso. Le encanta preguntar... y odia que le contesten mal.", { emote: "scary" }),
    ],
  },

  // ---------------------------------------------------------------- room 4: Ballerina, Site-19
  intro_4: {
    title: "Sitio-19", cast: ["ballerina"],
    beats: [
      card("Sitio-19"),
      say("fundacion", "Sitio-19. Nuestro archivo. Expedientes con barras negras y una máquina de café que nadie se atreve a usar."),
      say("ballerina", "Mi-mi-mi... ¡Bienvenidos a mi concurso! Soy Ballerina Cappuccina, presentadora oficial del Sitio-19."),
      say("ballerina", "Os voy a preguntar sobre las Backrooms. Si vais a quedaros a vivir aquí, más os vale saber dónde estáis."),
      say("ballerina", "Cada uno vota con su móvil, pero la respuesta solo cuenta cuando todos votáis lo mismo. Poneos de acuerdo."),
      say("ballerina", "Seis aciertos y os dejo salir. Cada fallo me enfría el café. Y no me gusta el café frío.", { emote: "scary" }),
    ],
  },
  riddle_4: {
    cast: ["ballerina"],
    beats: [
      say("ballerina", "¡Seis de seis! Bravissimi. Como premio, el expediente de vuestra ancla, sin censurar:"),
      riddle("ballerina"),
      say("ballerina", "Corred a escanear ese QR con el móvil. Y no derraméis nada por el pasillo."),
    ],
  },
  riddle_4_none: {
    cast: ["ballerina"],
    beats: [
      say("ballerina", "Mi-mi... este expediente está entero tachado. [REDACTADO]. Nadie ha escrito la pista."),
      say("ballerina", "Buscad el QR por vuestra cuenta y escaneadlo con el móvil. Y desconfiad de los que parecen demasiado fáciles."),
    ],
  },
  exit_4: {
    cast: ["ballerina"],
    beats: [
      say("ballerina", "La salida de emergencia da a un hangar abandonado. Huele a gasolina y a pantano."),
      say("ballerina", "Es la base de Bombardiro Crocodilo. Si oís una hélice... agachaos.", { emote: "scary" }),
    ],
  },

  // ---------------------------------------------------------------- room 5: Bombardiro, the hangar
  intro_5: {
    title: "Hangar", cast: ["bombardiro"],
    beats: [
      card("Hangar abandonado", { sfx: "warn" }),
      say("fundacion", "Alerta: objeto volador no identificado sobre el hangar. Es... un cocodrilo. Con alas.", { show: "alarm" }),
      say("bombardiro", "¡Bombardiro Crocodilo! Llegáis justo a tiempo: os he traído un regalito. Hace tic, tac."),
      say("bombardiro", "Solo uno de vosotros tiene la bomba en el móvil: el artificiero. Los demás tenéis trozos del manual."),
      say("bombardiro", "El artificiero describe lo que ve. Los demás buscáis la regla y se la decís. Hablad mucho, y rápido."),
      say("bombardiro", "Ocho minutos. Tres errores y ¡BUM! Pero tranquilos: tengo más bombas. Muchas más.", { emote: "scary", shake: true }),
    ],
  },
  riddle_5: {
    cast: ["bombardiro"],
    beats: [
      say("bombardiro", "¿Desactivada? Pfff... Vale, un trato es un trato. Desde el aire se ve todo, y he visto vuestra ancla:"),
      riddle("bombardiro"),
      say("bombardiro", "Escanead ese QR con el móvil antes de que se me ocurra otra idea."),
    ],
  },
  riddle_5_none: {
    cast: ["bombardiro"],
    beats: [
      say("bombardiro", "Desde aquí arriba no veo la pista: nadie la ha escrito."),
      say("bombardiro", "Buscad el QR por la casa y escaneadlo con el móvil. Yo vigilo desde el aire. Por si acaso."),
    ],
  },
  exit_5: {
    cast: ["bombardiro"],
    beats: [
      say("fundacion", "Atención: perdemos la señal. Algo golpea al otro lado de la pantalla.", { sfx: "warn", shake: true }),
      say("bombardiro", "Uy. Ese ruido lo conozco. Yo me voy volando, ragazzi."),
      say("sahur", "Tung, tung, tung. Ya casi son las cuatro y media. Bajad, que os espero.", { via: "phone", emote: "angry" }),
    ],
  },

  // ---------------------------------------------------------------- room 6: Sahur, the way out
  intro_6: {
    title: "Sala final", cast: ["sahur"],
    beats: [
      card("Sala final · La salida de Sahur", { sfx: "warn" }),
      say("fundacion", "Tung. Tung. Tung. Perdemos la señal de la Fundación... Estáis solos.", { shake: true }),
      say("sahur", "Os avisé tres veces: tung, tung, tung. La gente educada contesta.", { emote: "angry" }),
      say("sahur", "Pero bueno, ya que estáis despiertos... la salida está detrás de mis cinco puertas."),
      say("sahur", "Volvéis a ser bichitos, como en el Nivel 0. Campanas, pinchos, botones y llaves: o pasáis todos, o no pasa nadie."),
      say("sahur", "Y si uno pisa un pincho o se cae, volvéis todos al principio. Mi bate tiene muchísima paciencia. Tung.", { emote: "scary", shake: true }),
    ],
  },
  riddle_6: {
    cast: ["sahur"],
    beats: [
      say("sahur", "Vale, vale. Saltáis mejor de lo que pensaba. Esta es la última ancla: la salida."),
      riddle("sahur"),
      say("sahur", "Escanead ese QR con el móvil antes de las cuatro y media. Yo voy contando. Tung... tung...", { emote: "happy" }),
    ],
  },
  riddle_6_none: {
    cast: ["sahur"],
    beats: [
      say("sahur", "La pista de la salida no está escrita. Qué descuido. Tung.", { emote: "surprised" }),
      say("sahur", "Buscad el último QR por la casa y escaneadlo con el móvil. Si lo encontráis, os dejo ir. Seguramente."),
    ],
  },

  // ---------------------------------------------------------------- endings (by Brainrot band)
  ending_escape: {
    title: "Final", cast: ["patapim", "sahur", "tralalero"],
    beats: [
      card("Realidad recuperada"),
      say("fundacion", "Anclas estabilizadas. Realidad recuperada. Volvéis a vuestro salón, a vuestro sofá y a vuestra batería al dos por ciento."),
      say("sahur", "Bien despiertos, ragazzi. Así me gusta. Tung, tung, tung.", { emote: "happy" }),
      say("tralalero", "¡Tralalá! Volved cuando queráis. La piscina siempre está abierta.", { emote: "happy" }),
      say("patapim", "Brr brr... Yo me quedo aquí. Mis raíces os echarán de menos.", { emote: "happy" }),
      say("fundacion", "Fin del registro. Y, por favor, no hagáis scroll a las tres de la mañana."),
    ],
  },
  ending_passenger: {
    title: "Final", cast: ["chimpanzini"],
    beats: [
      card("Realidad recuperada... casi"),
      say("fundacion", "Anclas estabilizadas. Habéis vuelto. Casi todo ha vuelto con vosotros."),
      say("fundacion", "Detecto una conciencia de más en esta sala. No es de ninguno de vosotros.", { sfx: "warn" }),
      say("chimpanzini", "¡Chimpanzini Bananini! Uh, uh... qué sofá tan cómodo tenéis."),
      say("sahur", "Tung, tung. Se os ha colado uno. A mí no me miréis.", { via: "phone" }),
      say("fundacion", "Fin del registro. Si esta noche oís una cáscara de plátano... no os levantéis."),
    ],
  },
  ending_brainrots: {
    title: "Final", cast: ["patapim", "sahur", "tralalero"],
    beats: [
      card("4:30 AM", { sfx: "warn" }),
      say("fundacion", "Nivel de Brainrot crítico. Las anclas no responden. Repito: las anclas no responden.", { show: "alarm" }),
      say("sahur", "Tung, tung, tung... Os dije que a las cuatro y media pasaba a recoger.", { emote: "scary" }),
      say("patapim", "¡Brr brr! No os preocupéis: las raíces apenas pican.", { emote: "happy" }),
      say("tralalero", "¡Tralalero tralalá! Ya os están saliendo las aletas. Os quedan preciosas.", { emote: "happy" }),
      say("fundacion", "Registrando {count} nuevos sujetos. Clase de objeto: Keter. Fin de la transmisión.", { shake: true, show: "lineup" }),
    ],
  },
};

/** Rooms with a guardian (and so an intro, a riddle and a hand-off scene). */
export const GUARDED_ROOMS = [1, 2, 3, 4, 5, 6];

/** Story key -> scene ids. search:<n> picks riddle_<n> or riddle_<n>_none in runner.playlistFor. */
export const PLAYLISTS = {
  "intro:0": ["prologue"],
  "unlocked:0": ["noclip"],
  "ending:escape": ["ending_escape"],
  "ending:escape_with_passenger": ["ending_passenger"],
  "ending:brainrots": ["ending_brainrots"],
};
for (const n of GUARDED_ROOMS) {
  PLAYLISTS[`intro:${n}`] = [`intro_${n}`];
  if (n !== 6) PLAYLISTS[`unlocked:${n}`] = [`exit_${n}`]; // room 6's QR is the way out: the ending follows
}

/** Jumpscare one-liners (a decoy QR wakes its brainrot up on the TV). */
export const SCARES = {
  sahur: "¡Tung, tung, tung! ¿Quién no ha contestado al teléfono?",
  tralalero: "¡Tralalero tralalá! Te he visto moverte.",
  bombardiro: "¡Bombardiro Crocodilo! Aterrizaje forzoso... encima de ti.",
  ballerina: "Mi-mi-mi... ¿Bailas conmigo? Solo una pieza. Para siempre.",
  lirili: "Lirilì larilà... llegas tarde. Llevas siglos llegando tarde.",
  patapim: "¡Brr brr patapim! Mis raíces te han encontrado.",
  chimpanzini: "¡Chimpanzini Bananini! Uh, uh... ¿me pelas?",
  trippi: "¡Trippi troppi! Miau... con antenas.",
};

/** Phone copy while the TV tells the story. */
export const PHONE = {
  title: "Mirad la tele",
  waiting: "La tele os está contando algo...",
  yourTurn: "Te toca leer",
  readAloud: "Esta escena la lees tú: cada frase en voz alta para todos, y «Siguiente» cuando la hayan oído.",
  next: "Siguiente ▶",
  typing: "Espera a que termine la frase...",
  sent: "Un momento...",
};
