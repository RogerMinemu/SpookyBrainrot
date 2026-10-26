"""Plain-data content for the vertical slice: room plan, cameos and the Backrooms trivia."""
from __future__ import annotations

from dataclasses import dataclass
from typing import FrozenSet, List, Optional, Tuple


@dataclass(frozen=True)
class RoomSpec:
    room_no: int
    puzzle_id: str
    anchor: Optional[int]  # anchor level that unlocks the room (None = no anchor)
    title: str


# Room 0 has no anchor; scanning the last room's anchor ends the game. Room 5 was dropped: anchor 5 stays
# printed (the QR codes are printed once) but no room ever wakes it up.
ROOM_PLAN: List[RoomSpec] = [
    RoomSpec(room_no=0, puzzle_id="hold_together", anchor=None, title="Agarraos fuerte"),
    RoomSpec(room_no=1, puzzle_id="coop_platformer", anchor=1, title="Nivel 0"),
    RoomSpec(room_no=2, puzzle_id="red_light", anchor=2, title="Un, dos, tres... ¡Tralalero!"),
    RoomSpec(room_no=3, puzzle_id="shape_count", anchor=3, title="Contad las formas"),
    RoomSpec(room_no=4, puzzle_id="backrooms_trivia", anchor=4, title="Trivia de las Backrooms"),
    RoomSpec(room_no=6, puzzle_id="bomb_defusal", anchor=6, title="Desactivad la bomba"),
    RoomSpec(room_no=7, puzzle_id="sahur_dice", anchor=7, title="Sahur dice"),
]

# Anchors some room actually uses (the house config and the QR key flag the others as unused).
ANCHORS_IN_USE: FrozenSet[int] = frozenset(r.anchor for r in ROOM_PLAN if r.anchor is not None)

# Shown while the host has not written the riddle for an anchor yet (batch D).
RIDDLE_PLACEHOLDER = "La pista aún no ha sido escrita... buscad el ancla por vuestra cuenta."

# 8 decoys, each with a brainrot cameo shown on jumpscare.
CAMEOS: List[str] = [
    "Tung Tung Tung Sahur",
    "Tralalero Tralala",
    "Bombardiro Crocodilo",
    "Ballerina Cappuccina",
    "Lirilì Larilà",
    "Brr Brr Patapim",
    "Chimpanzini Bananini",
    "Trippi Troppi",
]


@dataclass(frozen=True)
class TriviaQuestion:
    q: str
    options: Tuple[str, str, str, str]  # the FIRST one is right; the puzzle shuffles them
    fact: str  # shown with the answer


# Room 4: Backrooms lore (the 2019 creepypasta, the fan wikis and Kane Pixels' series). Spanish, Spain.
TRIVIA: List[TriviaQuestion] = [
    TriviaQuestion(
        "¿Dónde se publicó la imagen que dio origen a las Backrooms?",
        ("En un hilo de 4chan", "En Reddit", "En Tumblr", "En un foro de Minecraft"),
        "Fue en 2019, en un hilo que pedía «imágenes inquietantes que dan mal rollo».",
    ),
    TriviaQuestion(
        "¿Qué tablón de 4chan vio nacer las Backrooms?",
        ("/x/, el de lo paranormal", "/v/, el de videojuegos", "/b/, el aleatorio", "/a/, el de anime"),
        "/x/ es el tablón de lo paranormal: el sitio perfecto para una foto que da mal rollo.",
    ),
    TriviaQuestion(
        "¿En qué año nació la creepypasta de las Backrooms?",
        ("2019", "2012", "2015", "2021"),
        "La imagen y el texto aparecieron en 2019; el fenómeno explotó en 2022.",
    ),
    TriviaQuestion(
        "Según el texto original, ¿cómo se llega a las Backrooms?",
        (
            "Haciendo noclip fuera de la realidad",
            "Durmiendo en un centro comercial",
            "Mirando un espejo a las 3:00",
            "Llamando a un número prohibido",
        ),
        "«Si no tienes cuidado y haces noclip fuera de la realidad donde no debes, acabarás en las Backrooms».",
    ),
    TriviaQuestion(
        "¿De dónde viene la palabra «noclip»?",
        (
            "De un truco de videojuegos para atravesar paredes",
            "De un término médico",
            "De una marca de grapas",
            "De la jerga de los ascensores",
        ),
        "En juegos como Quake, el comando noclip quita las colisiones y te deja atravesar paredes.",
    ),
    TriviaQuestion(
        "¿A qué huele el Nivel 0, según el texto original?",
        ("A moqueta vieja y húmeda", "A palomitas quemadas", "A cloro de piscina", "A tierra mojada"),
        "El texto habla del hedor a moqueta vieja y húmeda y de la locura del amarillo.",
    ),
    TriviaQuestion(
        "¿Qué sonido no para nunca en el Nivel 0?",
        ("El zumbido de los fluorescentes", "Un goteo constante", "Una música de ascensor", "Pasos en el techo"),
        "Los fluorescentes zumban al máximo sin descanso: es el ruido de fondo de las Backrooms.",
    ),
    TriviaQuestion(
        "¿Cuántas millas cuadradas de habitaciones vacías menciona el texto original?",
        ("Unos 600 millones", "Unas 6.000", "Unos 6 millones", "Ninguna cifra: dice «infinitas»"),
        "«Unos seiscientos millones de millas cuadradas de habitaciones vacías» donde quedarse atrapado.",
    ),
    TriviaQuestion(
        "Según el texto original, si oyes algo merodeando cerca...",
        (
            "...seguro que eso también te ha oído a ti",
            "...es solo el viento",
            "...tienes que gritar",
            "...es otro superviviente",
        ),
        "«Que Dios te salve si oyes algo merodeando cerca, porque seguro que eso te ha oído a ti».",
    ),
    TriviaQuestion(
        "¿Qué apodo recibe a menudo el Nivel 0?",
        ("El vestíbulo (The Lobby)", "La piscina", "El sótano", "La fiesta"),
        "En las wikis de fans aparece como «The Lobby» o «Tutorial Level»: es la puerta de entrada.",
    ),
    TriviaQuestion(
        "¿De qué color es el papel pintado del Nivel 0?",
        ("Amarillo", "Verde", "Azul", "Rojo"),
        "El amarillo de las paredes es la imagen más reconocible de las Backrooms.",
    ),
    TriviaQuestion(
        "¿Cómo es el Nivel 0?",
        (
            "Oficinas vacías con moqueta y papel amarillo",
            "Cuevas húmedas sin luz",
            "Pasillos de hospital",
            "Vagones de metro abandonados",
        ),
        "Habitaciones sin muebles, moqueta empapada y papel pintado amarillo, repetidas sin fin.",
    ),
    TriviaQuestion(
        "¿Qué bebida ayuda a los exploradores a mantener la cordura?",
        ("El agua de almendras", "El café frío", "La leche de coco", "La gaseosa de limón"),
        "El agua de almendras (Almond Water) es el recurso más preciado de las Backrooms.",
    ),
    TriviaQuestion(
        "¿Qué entidad organiza fiestas y firma con «=)»?",
        ("Los Partygoers", "Los Smilers", "Los Hounds", "Los Facelings"),
        "Los Partygoers te invitan a «la fiesta» y firman con una carita «=)». Mejor no ir.",
    ),
    TriviaQuestion(
        "¿Cómo se llama el nivel donde siempre hay una «fiesta»?",
        ("Level Fun =)", "Level Party :D", "Level Happy ^_^", "Level Joy :P"),
        "Level Fun =) está lleno de globos y Partygoers. Si alguien te invita... corre.",
    ),
    TriviaQuestion(
        "¿Cómo se reconoce a un Smiler?",
        (
            "Una sonrisa que brilla en la oscuridad",
            "Un traje de oficina sin cabeza",
            "Un globo rojo que flota",
            "Unas pisadas mojadas",
        ),
        "De un Smiler solo se ven unos ojos y una sonrisa enorme brillando en las zonas oscuras.",
    ),
    TriviaQuestion(
        "¿Qué tienen de raro los Facelings?",
        ("No tienen cara", "Tienen cuatro brazos", "Son invisibles", "Solo hablan al revés"),
        "Los Facelings parecen personas normales... salvo porque no tienen rasgos en la cara.",
    ),
    TriviaQuestion(
        "¿Qué hacen los Skin-Stealers?",
        (
            "Se hacen pasar por humanos llevando su piel",
            "Roban las linternas",
            "Imitan voces por la radio",
            "Se esconden en el agua",
        ),
        "Los Skin-Stealers se disfrazan con la piel de sus víctimas. Desconfiad de las caras raras.",
    ),
    TriviaQuestion(
        "¿Cómo se llama el nivel de pasillos rojos donde hay que huir sin parar?",
        ("Nivel !: «¡Corre por tu vida!»", "Nivel 1: «Zona habitable»", "Nivel 4: «Oficina abandonada»", "Nivel 2: «Tuberías»"),
        "El Nivel ! es un pasillo de luces rojas parpadeantes con algo detrás de ti.",
    ),
    TriviaQuestion(
        "¿Cómo se llaman los niveles llenos de piscinas y azulejos blancos?",
        ("Las Poolrooms", "Las Bathrooms", "Los Waterworks", "Las Saunarooms"),
        "Las Poolrooms son piscinas infinitas y vacías: preciosas, tranquilas... y muy inquietantes.",
    ),
    TriviaQuestion(
        "¿Qué es el Nivel 1 según la wiki?",
        ("Una zona habitable con agua y luz", "Un bosque infinito", "Un hotel embrujado", "Una ciudad sin fin"),
        "El Nivel 1, «Habitable Zone», es un enorme almacén de hormigón donde aparecen cajas con suministros.",
    ),
    TriviaQuestion(
        "¿Cómo se llama el Nivel 2?",
        ("Pipe Dreams", "Electrical Station", "Terror Hotel", "The Lobby"),
        "El Nivel 2 son túneles de mantenimiento oscuros, llenos de tuberías y cada vez más calurosos.",
    ),
    TriviaQuestion(
        "¿Cómo se llama el Nivel 3?",
        ("Electrical Station", "Pipe Dreams", "Habitable Zone", "Abandoned Office"),
        "El Nivel 3 es una central eléctrica laberíntica, ruidosa y peligrosa.",
    ),
    TriviaQuestion(
        "¿Qué hay en el Nivel 4?",
        ("Una oficina abandonada", "Una piscina infinita", "Un parque de atracciones", "Un aparcamiento vacío"),
        "El Nivel 4, «Abandoned Office», son oficinas interminables sin una sola persona.",
    ),
    TriviaQuestion(
        "¿Qué nivel es el «Terror Hotel»?",
        ("El Nivel 5", "El Nivel 0", "El Nivel 2", "El Nivel 1"),
        "El Nivel 5 es un hotel elegante y antiguo de pasillos sin fin.",
    ),
    TriviaQuestion(
        "¿Qué significan las siglas M.E.G. en la wiki de las Backrooms?",
        ("Major Explorer Group", "Mapa de Entidades Grandes", "Mega Escape Group", "Ministry of Empty Gardens"),
        "El M.E.G. es el grupo de exploradores que cartografía los niveles y ayuda a los recién llegados.",
    ),
    TriviaQuestion(
        "¿Qué es la B.N.T.G.?",
        ("Un grupo de comerciantes nómadas", "Una entidad que imita bebés", "Un nivel nevado", "Un tipo de agua"),
        "La Backrooms Nomadic Trading Group comercia con suministros entre niveles.",
    ),
    TriviaQuestion(
        "¿Quién creó la serie de vídeos «The Backrooms (Found Footage)»?",
        ("Kane Pixels", "MrBeast", "Markiplier", "Corridor Digital"),
        "Kane Parsons, alias Kane Pixels, la publicó en YouTube en 2022 con solo 16 años.",
    ),
    TriviaQuestion(
        "¿Qué productora anunció una película de las Backrooms dirigida por Kane Parsons?",
        ("A24", "Pixar", "Blumhouse", "Netflix"),
        "A24, la productora de «Hereditary», anunció la película en 2023.",
    ),
    TriviaQuestion(
        "En la serie de Kane Pixels, ¿qué organización investigaba las Backrooms en secreto?",
        ("Async", "La Fundación SCP", "Umbrella", "Aperture Science"),
        "El Async Research Institute las investigaba en secreto, en grabaciones con estética de los 90.",
    ),
    TriviaQuestion(
        "¿Con qué estética están grabados los vídeos de Kane Pixels?",
        ("Cinta VHS antigua", "Vídeo vertical de móvil", "Directo de Twitch", "Cámara de seguridad en 4K"),
        "El estilo «found footage» de cinta VHS es lo que hizo tan creíble la serie.",
    ),
    TriviaQuestion(
        "¿Cómo se llama la estética de lugares de paso vacíos que inspira las Backrooms?",
        ("Espacios liminales", "Arquitectura brutalista", "Vaporwave", "Cottagecore"),
        "Pasillos, parkings, piscinas... sitios hechos para estar de paso, vistos completamente vacíos.",
    ),
    TriviaQuestion(
        "¿Cuál de estos es un videojuego cooperativo ambientado en las Backrooms?",
        ("Escape the Backrooms", "Lethal Company", "Phasmophobia", "Among Us"),
        "En Escape the Backrooms (2022) hasta cuatro jugadores intentan salir juntos... como vosotros.",
    ),
]
