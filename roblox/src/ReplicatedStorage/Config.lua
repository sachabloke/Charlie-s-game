--!strict
-- Shared settings for Maths Royale (used by server and client).
local Config = {}

Config.MAP_SIZE = 900 -- studs, square
Config.CHEST_COUNT = 40
Config.CHEST_RESPAWN = 75 -- seconds
Config.QUESTION_TIME = 35 -- seconds for a chest sum (plus 10 per tier above 1)
Config.RELOAD_QUIZ_TIME = 8 -- seconds for the quick reload sum
Config.RESPAWN_QUESTION_TIME = 60
Config.STORM_PERIOD = 150 -- seconds between storm waves
Config.STORM_SHRINK_TIME = 70 -- seconds the wave takes to close in
Config.STORM_DAMAGE = 3 -- per second outside the circle
Config.BRICKS_PER_SUM = 3
Config.WALL_HEALTH = 150

Config.RARITIES = { "common", "uncommon", "rare", "epic", "legendary" }
Config.RARITY = {
	common = { label = "Common", color = Color3.fromRGB(184, 188, 196), tier = 1, mult = 1.0, chance = 36 },
	uncommon = { label = "Uncommon", color = Color3.fromRGB(76, 209, 55), tier = 1, mult = 1.1, chance = 26 },
	rare = { label = "Rare", color = Color3.fromRGB(59, 157, 255), tier = 2, mult = 1.2, chance = 20 },
	epic = { label = "Epic", color = Color3.fromRGB(177, 92, 255), tier = 3, mult = 1.35, chance = 12 },
	legendary = { label = "Legendary", color = Color3.fromRGB(255, 180, 0), tier = 4, mult = 1.55, chance = 6 },
}

-- damage per hit, seconds between shots, magazine size, spread (radians), range (studs), pellets
Config.WEAPONS = {
	pistol = { name = "Pistol", dmg = 22, rate = 0.33, mag = 12, spread = 0.02, range = 250, pellets = 1, auto = false },
	smg = { name = "SMG", dmg = 13, rate = 0.1, mag = 30, spread = 0.05, range = 180, pellets = 1, auto = true },
	shotgun = { name = "Shotgun", dmg = 11, rate = 0.85, mag = 5, spread = 0.09, range = 120, pellets = 6, auto = false },
	rifle = { name = "Assault Rifle", dmg = 24, rate = 0.17, mag = 25, spread = 0.025, range = 320, pellets = 1, auto = true },
	sniper = { name = "Sniper", dmg = 85, rate = 1.3, mag = 3, spread = 0.003, range = 600, pellets = 1, auto = false },
}
Config.WEAPON_WEIGHTS = {
	common = { pistol = 40, smg = 25, shotgun = 25, rifle = 10 },
	uncommon = { pistol = 25, smg = 30, shotgun = 25, rifle = 20 },
	rare = { pistol = 10, smg = 25, shotgun = 25, rifle = 30, sniper = 10 },
	epic = { smg = 20, shotgun = 20, rifle = 35, sniper = 25 },
	legendary = { shotgun = 15, rifle = 40, sniper = 45 },
}
Config.CONSUMABLES = {
	bandage = { name = "Bandage", heal = 15, maxTo = 75 },
	medkit = { name = "Medkit", heal = 100, maxTo = 100 },
	minishield = { name = "Mini Shield", shield = 25, maxTo = 50 },
	shieldpotion = { name = "Shield Potion", shield = 50, maxTo = 100 },
}

return Config
