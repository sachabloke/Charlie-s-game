# The kit: parts any of our games can use

Everything in this folder is built once and shared. A game takes what it needs and leaves the rest. Whiteout is the first game built on it.
Nothing here knows about any one game: no story, no level layout.

**The look is realistic.** Cartoon-style things (the Living Postcards trees, animals and characters) are not in here; they stay in that project.

## What is in it

| Part | What it gives a game | Came from |
|---|---|---|
| `picture.js` | The finished picture: glow, night colours, film grain, soft shadows where things meet, mist with beams of light in it, frost creeping over the screen, fades and a wake-up blur. Three quality levels. | Lake Valley's picture-making, slimmed so tablets can run it |
| `sky.js` | Night sky (moon, stars, aurora), snowfall that follows the player and stays out of buildings, fire, a searchlight beam | Whiteout; snowfall after Lake Valley's |
| `surfaces.js` | Surfaces painted in code, each with relief: concrete, wallpaper, two-tone painted walls, wooden floor, tiles, lino, fabric, rusty and painted metal, snow, ice, frosted glass, building fronts, shop fronts | Whiteout |
| `build.js` | Builds rooms and streets from boxes (walls with door and window holes cut out), merges them so they draw fast, and keeps the lists of what the player bumps into and stands on | Whiteout |
| `sound.js` | Plays the recordings in `sounds/`, plus sounds made in code (fire, radio, keypad, breaking ice, a low hum) | Whiteout |
| `sounds/` | 43 recordings: wind, footsteps on six kinds of ground, doors, drips, a stream, a bell, voices, a dog, farm animals and 20 kinds of bird | Lake Valley; all free to use, see `sounds/CREDITS.md` |
| `three.js` | The 3D engine every part is written for | `public/vendor/` |

## How a game uses it

```js
import { makeMaterials } from '../../kit/surfaces.js';
import { Builder } from '../../kit/build.js';
import { makeSky, makeSnow } from '../../kit/sky.js';
import { makePost } from '../../kit/picture.js';
import { Sound } from '../../kit/sound.js';
```

`public/whiteout/js/main.js` shows all of them working together.

## Rules for adding to the kit

1. A part goes in only when it would be useful to a second game. Story, signs and level layouts stay in the game's own folder.
2. Every picture, model or sound that was not made by us keeps a note beside it saying where it came from and that we may use it.
3. Realistic look only. One look per game; cartoon and realistic things are never mixed.
4. Each part must still run on a tablet at the lowest quality level.

## Not here yet

- Real-looking 3D objects (cars, furniture, street lamps). Lake Valley's are countryside stone and wood. City ones need making.
- Lake Valley's daytime sky, clouds, rain and seasons. They are written for its newer 3D engine and need fitting before they can be shared.
- Characters and animals.
