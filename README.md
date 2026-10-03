# Maths Royale

**Play now: https://maths-royale.onrender.com** (first load after a quiet spell takes about a minute while the free server wakes up)

A 3D Fortnite-style battle game for up to 8 players, with blocky Roblox-style characters, where **every chest is locked with a maths sum**.
Guns, bandages, medkits and shield potions all come out of chests, so the only way to get kitted
out is to answer sums. Harder sums unlock better loot:

| Chest colour | Sums | Loot |
|---|---|---|
| Grey / Green | Times tables, division facts, adding, taking away, rounding, place value | Basic guns, bandages |
| Blue | Equivalent fractions, fraction of an amount, simplifying, adding/subtracting fractions, decimals, percentages, negative numbers, Roman numerals, measures, perimeter | Better guns, shields |
| Purple | Percentages of amounts, area, angles, division with remainders, mixed numbers, comparing fractions, square numbers, primes/factors/multiples, sequences, time | Strong guns, medkits |
| Gold | Long multiplication, long division, BIDMAS, multiplying fractions, ratio, algebra, mean, decimals, angles in shapes, money problems | The best guns, full shields |

Wrong answers show the correct answer, and at the end of each game every player gets a
**maths report** showing which topics they got right and wrong.

## Quick start (one computer)

1. Install Node.js from https://nodejs.org (version 18 or newer).
2. Open a terminal in this folder and run:
   ```
   npm install
   npm start
   ```
3. Open http://localhost:3000 in a browser (Chrome works best).
4. Type a name and press PLAY. You get a 4-letter room code. Add some bots and press START GAME.

Anyone on the same Wi-Fi can join by opening `http://<your-computer's-IP>:3000` and typing the room code.

## Playing with friends over the internet

The game needs to run on a server that everyone can reach. The easiest free option is **Render**.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/sachabloke/Charlie-s-game)

1. Click the button above (or go to https://render.com/deploy?repo=https://github.com/sachabloke/Charlie-s-game).
2. Sign in to Render with your GitHub account (free, no card needed).
3. Click **Deploy Blueprint**. Render reads `render.yaml` and sets everything up.
4. After a minute or two you get a web address like `https://maths-royale.onrender.com`.
5. Share that address with friends. One person presses PLAY, gets a room code and tells the others.

Notes:
- The free Render plan goes to sleep when nobody is using it. The first visit after a break takes
  about a minute to wake up. After that it is instant.
- The game also works on Railway, Fly.io, or any host that can run Node.js (`npm start`). A
  `Dockerfile` is included.

On a tablet or phone: left thumb moves, right thumb looks around, and the FIRE button shoots.

Alternative: run it at home with `npm start` and in a second terminal run `npx localtunnel --port 3000`.
It prints a temporary public address you can share. Your computer has to stay on.

## Controls

| Key | Action |
|---|---|
| Click on the game | Grabs the mouse so you can look around (Esc gives it back) |
| W A S D or arrow keys | Move |
| Mouse | Look around and aim |
| Left click | Shoot (or use the selected bandage / shield) |
| E | Open the chest you are standing next to (a sum pops up) |
| 1 – 5 | Pick an item from your bag |
| R | Reload |
| Q | Drop the selected item |
| Esc | Walk away from a sum |

## Game modes (chosen by the host in the lobby)

- **Battle** – 8 minutes, most eliminations wins. When you are knocked out you answer a sum to respawn.
- **Battle Royale** – a storm shrinks the map; last one standing wins. Nobody starts with a gun.

**Sum difficulty** – Easier (Year 4/5), Normal (Year 5/6) or Harder (Year 6+).
**Bots** – add computer players so the game is fun even with one or two people.

## Changing things

- Sums live in `server/maths.js`. Each topic is a few lines; copy one to add your own.
- Guns, healing items and how often each chest colour appears are in `server/items.js`.
- Game numbers (time to answer, match length, storm timing, chest count) are at the top of `server/game.js`.

## Tests

```
npm test
```
Checks that every generated sum accepts its own answer and plays a full simulated match with bots.
