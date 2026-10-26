SpookyBrainrotEscape es un juego web para jugar en grupo de terror, misterio y ingenio.

Debe mezclar puzzles ingeniosos que resolver para averiguar la pista para encontrar un objeto en la vida real y desbloquear el candado a la siguiente sala

La web al entrar debe permitir crear nuevas partidas, continuarlas y eliminarlas.
Cuando entras a una partida, debe haber un endpoint tipo [dominio configurable en el env]/play que al entrar, los moviles de los jugadores se convertiran en "mandos" que permitirán hacer acciones en la sala (sobretodo para resolver el puzzle)

Debemos plantear una narrativa con X salas (lo ideal es que dure una hora o hora y media el escape room) donde vayamos sala por sala enfrentandonos a los retos que los diferentes brainrots nos propnen. A parte del diseño de la sala, habrá que hacer el diseño de los brainrots. Habia pensado que podiamos usar la estética acuarela de este repo https://github.com/RogerMinemu/MinemiSongs (se han hecho videos) pero podemos reutilizarlo para crear las escenas. Incluso podemos crear cinematicas de introduccion (con Suno puedo hacerte las canciones) y que quede una experiencia así chula y de terror.

Después de resolver un puzzle web con el control movil en la pantalla aparecerá una pista de donde se esconde el "objeto llave" para desbloquear la siguiente sala, los jugadores deberán buscar por toda la casa X objeto y ponerlo como contraseña para desbloquear el candado (Podría ser pasta de dientes x ejemplo)

El servidor web debe ser en python ya que lo hostearé en pterodactyl
