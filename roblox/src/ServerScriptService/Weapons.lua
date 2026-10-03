--!nonstrict
-- Builds gun and item Tools out of parts (no uploaded assets needed).
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Config = require(ReplicatedStorage:WaitForChild("Config"))

local Weapons = {}

local function piece(parent: BasePart, size: Vector3, offset: CFrame, color: Color3, material: Enum.Material?): Part
	local p = Instance.new("Part")
	p.Size = size; p.Color = color; p.Material = material or Enum.Material.Metal
	p.CanCollide = false; p.Massless = true
	p.TopSurface = Enum.SurfaceType.Smooth; p.BottomSurface = Enum.SurfaceType.Smooth
	p.CFrame = parent.CFrame * offset
	p.Parent = parent.Parent
	local weld = Instance.new("WeldConstraint"); weld.Part0 = parent; weld.Part1 = p; weld.Parent = p
	return p
end

local METAL = Color3.fromRGB(47, 54, 64)
local DARK = Color3.fromRGB(30, 39, 46)
local WOOD = Color3.fromRGB(141, 85, 36)

-- The Handle is the grip; the gun points along the handle's -Z (forward for a Tool).
function Weapons.makeTool(key: string, rarity: string): Tool
	local def = Config.WEAPONS[key]
	local rar = Config.RARITY[rarity]
	local tool = Instance.new("Tool")
	tool.Name = rar.label .. " " .. def.name
	tool.RequiresHandle = true
	tool.CanBeDropped = false
	tool:SetAttribute("Weapon", key)
	tool:SetAttribute("Rarity", rarity)
	tool:SetAttribute("Ammo", def.mag)
	tool:SetAttribute("Mag", def.mag)
	tool:SetAttribute("Auto", def.auto)
	tool:SetAttribute("Rate", def.rate)
	tool.ToolTip = def.name .. " (" .. rar.label .. ")"
	local handle = Instance.new("Part")
	handle.Name = "Handle"; handle.Size = Vector3.new(0.5, 1.2, 0.7); handle.Color = DARK; handle.Material = Enum.Material.Metal
	handle.CanCollide = false; handle.Massless = true; handle.Parent = tool
	tool.Grip = CFrame.new(0, -0.1, 0.2)
	local acc = rar.color
	if key == "pistol" then
		piece(handle, Vector3.new(0.5, 0.5, 1.8), CFrame.new(0, 0.75, -0.6), METAL)
		piece(handle, Vector3.new(0.52, 0.12, 0.8), CFrame.new(0, 1.05, -0.8), acc, Enum.Material.Neon)
	elseif key == "smg" then
		piece(handle, Vector3.new(0.6, 0.7, 2.4), CFrame.new(0, 0.8, -0.9), METAL)
		piece(handle, Vector3.new(0.3, 0.3, 0.8), CFrame.new(0, 0.7, -2.4), DARK)
		piece(handle, Vector3.new(0.4, 1.1, 0.4), CFrame.new(0, 0.1, -1.4), DARK)
		piece(handle, Vector3.new(0.5, 0.5, 1.0), CFrame.new(0, 0.8, 0.9), DARK)
		piece(handle, Vector3.new(0.62, 0.12, 1.4), CFrame.new(0, 1.18, -0.9), acc, Enum.Material.Neon)
	elseif key == "shotgun" then
		piece(handle, Vector3.new(0.5, 0.5, 3.2), CFrame.new(0, 0.85, -1.6), METAL)
		piece(handle, Vector3.new(0.5, 0.45, 1.4), CFrame.new(0, 0.4, -1.6), WOOD, Enum.Material.Wood)
		piece(handle, Vector3.new(0.7, 0.9, 1.4), CFrame.new(0, 0.7, 1.0), WOOD, Enum.Material.Wood)
		piece(handle, Vector3.new(0.52, 0.12, 1.0), CFrame.new(0, 1.15, -1.2), acc, Enum.Material.Neon)
	elseif key == "rifle" then
		piece(handle, Vector3.new(0.6, 0.8, 2.2), CFrame.new(0, 0.85, -0.7), METAL)
		piece(handle, Vector3.new(0.3, 0.3, 1.8), CFrame.new(0, 0.95, -2.6), METAL)
		piece(handle, Vector3.new(0.45, 1.2, 0.5), CFrame.new(0, 0.1, -0.9), DARK)
		piece(handle, Vector3.new(0.5, 0.6, 1.3), CFrame.new(0, 0.75, 1.0), DARK)
		piece(handle, Vector3.new(0.3, 0.3, 1.0), CFrame.new(0, 1.4, -0.7), DARK)
		piece(handle, Vector3.new(0.62, 0.12, 1.2), CFrame.new(0, 1.3, -0.7), acc, Enum.Material.Neon)
	else -- sniper
		piece(handle, Vector3.new(0.5, 0.6, 2.4), CFrame.new(0, 0.85, -0.8), METAL)
		piece(handle, Vector3.new(0.25, 0.25, 3.0), CFrame.new(0, 0.95, -3.3), METAL)
		piece(handle, Vector3.new(0.5, 0.7, 1.6), CFrame.new(0, 0.7, 1.1), WOOD, Enum.Material.Wood)
		piece(handle, Vector3.new(0.35, 0.35, 1.4), CFrame.new(0, 1.45, -0.9), DARK)
		piece(handle, Vector3.new(0.2, 0.2, 0.2), CFrame.new(0, 1.45, -1.65), Color3.fromRGB(116, 185, 255), Enum.Material.Neon)
		piece(handle, Vector3.new(0.52, 0.12, 1.2), CFrame.new(0, 1.2, -0.8), acc, Enum.Material.Neon)
	end
	return tool
end

function Weapons.makeConsumable(key: string, count: number): Tool
	local def = Config.CONSUMABLES[key]
	local tool = Instance.new("Tool")
	tool.Name = def.name
	tool.RequiresHandle = true; tool.CanBeDropped = false
	tool:SetAttribute("Consumable", key); tool:SetAttribute("Count", count)
	tool.ToolTip = def.name
	local handle = Instance.new("Part")
	handle.Name = "Handle"; handle.CanCollide = false; handle.Massless = true
	if def.heal then
		handle.Size = Vector3.new(1.2, 0.5, 1.2); handle.Color = Color3.fromRGB(240, 240, 240); handle.Material = Enum.Material.Fabric
		piece(handle, Vector3.new(0.6, 0.12, 1.0), CFrame.new(0, 0.3, 0), Color3.fromRGB(230, 50, 50), Enum.Material.SmoothPlastic)
		piece(handle, Vector3.new(1.0, 0.12, 0.6), CFrame.new(0, 0.3, 0), Color3.fromRGB(230, 50, 50), Enum.Material.SmoothPlastic)
	else
		handle.Shape = Enum.PartType.Cylinder; handle.Size = Vector3.new(1.4, 0.7, 0.7); handle.Color = Color3.fromRGB(80, 160, 255); handle.Material = Enum.Material.Glass; handle.Transparency = 0.3
		piece(handle, Vector3.new(0.3, 0.5, 0.5), CFrame.new(0.8, 0, 0), Color3.fromRGB(50, 50, 60), Enum.Material.SmoothPlastic)
	end
	handle.Parent = tool
	return tool
end

local function weighted(weights: { [string]: number }): string
	local total = 0
	for _, w in pairs(weights) do total += w end
	local r = math.random() * total
	for k, w in pairs(weights) do r -= w; if r <= 0 then return k end end
	local last = "pistol"
	for k in pairs(weights) do last = k end
	return last
end
function Weapons.rollRarity(): string
	local w = {}
	for _, r in ipairs(Config.RARITIES) do w[r] = Config.RARITY[r].chance end
	return weighted(w)
end
-- Loot for a chest of the given rarity: a gun plus healing / shields.
function Weapons.makeLoot(rarity: string): { Tool }
	local loot = { Weapons.makeTool(weighted(Config.WEAPON_WEIGHTS[rarity]), rarity) }
	local tier = Config.RARITY[rarity].tier
	if tier <= 1 then
		table.insert(loot, if math.random() < 0.6 then Weapons.makeConsumable("bandage", 3) else Weapons.makeConsumable("minishield", 2))
	elseif tier == 2 then
		table.insert(loot, if math.random() < 0.5 then Weapons.makeConsumable("minishield", 3) else Weapons.makeConsumable("shieldpotion", 1))
	elseif tier == 3 then
		table.insert(loot, if math.random() < 0.5 then Weapons.makeConsumable("shieldpotion", 1) else Weapons.makeConsumable("medkit", 1))
		table.insert(loot, Weapons.makeConsumable("bandage", 2))
	else
		table.insert(loot, Weapons.makeConsumable("shieldpotion", 2))
		table.insert(loot, Weapons.makeConsumable("medkit", 1))
	end
	return loot
end

return Weapons
