# Escapa de Tung Tung Tung Sahur

Juego de terror y huida para el navegador. Es de madrugada y **Tung Tung Tung Sahur**, el tronco con bate, recorre el laberinto del pueblo golpeando su tambor. Recoge todas las llaves doradas, abre la puerta de la muralla sur y escapa antes de que te atrape.

## Cómo jugar

| Acción | Teclado / ratón | Móvil |
| --- | --- | --- |
| Moverse | `WASD` o flechas | Joystick (mitad izquierda) |
| Correr (hace ruido) | `Shift` | Botón **CORRER** |
| Apuntar la linterna | Ratón | Hacia donde caminas |
| Encender / apagar la linterna | `F` o clic derecho | Botón **LUZ** |
| Pausa | `Esc` / `P` | Botón ⏸ |
| Silenciar | `M` | Botón 🔊 |

- Sahur te ve si estás en su línea de visión. Con la linterna apagada te ve desde más cerca, pero tú ves menos.
- Si corres, te oye aunque no te vea. La energía se agota y tarda en recuperarse.
- En la **hierba alta** quedas oculto si no corres y Sahur no está pegado a ti.
- Su "tung tung tung" y sus ojos brillantes te avisan de dónde está. Cuando está cerca, los bordes de la pantalla se ponen rojos y oyes tu corazón.
- Cada nivel es un laberinto nuevo, más grande, con más llaves y un Sahur más rápido.

## Detalles técnicos

- Todo en `index.html`, `style.css` y `game.js`, sin dependencias ni paso de compilación. Solo las fuentes se cargan de Google Fonts.
- Gráficos dibujados con Canvas 2D: muros en falso 3D, iluminación con sombras proyectadas (raycasting sobre la cuadrícula), farolas que parpadean, luciérnagas, niebla y partículas.
- Sonido sintetizado con Web Audio (golpes de madera, latidos, ambiente nocturno, grillos) y voz con la Web Speech API cuando el navegador la tiene.
- Laberintos generados al azar con bucles y plazas; Sahur busca el camino con BFS.
- El récord se guarda en el `localStorage` del navegador.

## Uso

Abre `index.html` en el navegador o publícalo tal cual en GitHub Pages.
