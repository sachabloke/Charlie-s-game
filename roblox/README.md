# Maths Royale for Roblox

A Fortnite-style game inside Roblox where **maths makes everything happen**:

- Chests are locked with sums (harder sums, better loot). Grey, green, blue, purple and gold chests.
- **Reloading is a quick sum.** Empty magazine? Answer a times-table in 8 seconds or wait with half a magazine.
- **Building walls costs bricks**, and bricks only come from correct answers (press F to build).
- **Brain level**: every 5 correct answers levels you up and your guns hit harder. Wrong answers cost progress.
- **Respawn by sum**: when you're eliminated you must solve a sum to get back in.
- **Streaks**: 3 in a row gives shield. Sums adapt to each child and repeat the topics they get wrong.
- A **vault** in the middle with legendary chests behind a "maths gate" (hard sum).
- **Storm waves** every couple of minutes push everyone together.
- The whole island (terrain, houses, trees, pond, hills) builds itself when the game starts.

## Setting it up (one time, about 15 minutes)

1. On a PC or Mac, install **Roblox Studio** from https://create.roblox.com (it's free). Log in with Charlie's account or your own.
2. Download the file **`MathsRoyale.rbxl`** from this folder (click it, then "Download raw file").
3. In Roblox Studio choose **File → Open from File** and pick `MathsRoyale.rbxl`.
4. Press the **Play** button (top bar) to try it yourself. The map builds in a few seconds. Walk to a chest, press E, answer the sum.
5. To let friends play: **File → Publish to Roblox**. Give it a name like "Maths Royale", press Create.
6. Then go to https://create.roblox.com/dashboard/creations, click the game, **Settings → Permissions**, and set **Playability** to **Friends** (only Charlie's Roblox friends can join) or **Public**.
7. Also under **Settings → Security**, turn on **Enable Studio Access to API Services** so the game can save each child's brain level and maths history between sessions.
8. Charlie opens Roblox, goes to his profile → Creations, and plays. Friends find it on his profile or he invites them.

## Controls

| Key | Action |
|---|---|
| W A S D / mouse | Move and look (standard Roblox) |
| Number keys | Pick a gun or item from the bar |
| Click | Shoot (or use a bandage / shield) |
| R | Reload: a quick sum pops up |
| E | Open a chest or the vault gate (a sum pops up) |
| F | Build a wall in front of you (costs 1 brick) |
| Space | Jump |

Phones and tablets work with Roblox's normal touch controls; tapping with a gun out fires it.

## Changing things

- Sums are in `src/ServerScriptService/Maths.lua`, one short block per topic.
- Guns, loot, timings, storm and brick numbers are in `src/ReplicatedStorage/Config.lua`.
- After editing scripts, rebuild the place file with [Rojo](https://rojo.space): `rojo build default.project.json -o MathsRoyale.rbxl`, or paste the scripts into Studio by hand.

## Checking the scripts without Studio

`luau-lsp analyze --definitions=globalTypes.d.luau --sourcemap=sourcemap.json src` with the Roblox definitions file from the luau-lsp project reports any misuse of the Roblox API. The maths module also runs standalone under the `luau` command for self-testing.
