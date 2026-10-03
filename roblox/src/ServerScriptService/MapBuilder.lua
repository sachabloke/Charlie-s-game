--!nonstrict
-- Builds the whole island at server start: terrain, houses, trees, rocks, the vault, spawns.
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Lighting = game:GetService("Lighting")
local Config = require(ReplicatedStorage:WaitForChild("Config"))

local MapBuilder = {}
local SIZE = Config.MAP_SIZE
local HALF = SIZE / 2

export type Rect = { x: number, z: number, w: number, d: number }
export type MapInfo = { houses: { Rect }, trees: { Vector3 }, chestSpots: { Vector3 }, vault: Rect, mapFolder: Folder }

local function part(props: { [string]: any }): Part
	local p = Instance.new("Part")
	p.Anchored = true
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	for k, v in pairs(props) do (p :: any)[k] = v end
	return p
end
local function wedge(props: { [string]: any }): WedgePart
	local p = Instance.new("WedgePart")
	p.Anchored = true
	for k, v in pairs(props) do (p :: any)[k] = v end
	return p
end
local function rnd(a: number, b: number): number return a + math.random() * (b - a) end
local function overlaps(r: Rect, list: { Rect }, pad: number): boolean
	for _, o in ipairs(list) do
		if r.x - r.w / 2 - pad < o.x + o.w / 2 and r.x + r.w / 2 + pad > o.x - o.w / 2 and r.z - r.d / 2 - pad < o.z + o.d / 2 and r.z + r.d / 2 + pad > o.z - o.d / 2 then return true end
	end
	return false
end
local function insideAny(x: number, z: number, list: { Rect }, pad: number): boolean
	for _, o in ipairs(list) do
		if x > o.x - o.w / 2 - pad and x < o.x + o.w / 2 + pad and z > o.z - o.d / 2 - pad and z < o.z + o.d / 2 + pad then return true end
	end
	return false
end

local HOUSE_COLORS = { Color3.fromRGB(205, 133, 63), Color3.fromRGB(176, 190, 197), Color3.fromRGB(222, 184, 135), Color3.fromRGB(255, 228, 196), Color3.fromRGB(144, 164, 174), Color3.fromRGB(255, 160, 122) }
local ROOF_COLORS = { Color3.fromRGB(120, 40, 31), Color3.fromRGB(60, 60, 70), Color3.fromRGB(40, 70, 110), Color3.fromRGB(34, 85, 51) }

local function buildHouse(folder: Folder, r: Rect, index: number)
	local h = 14 + math.random(0, 6)
	local wallColor = HOUSE_COLORS[(index % #HOUSE_COLORS) + 1]
	local roofColor = ROOF_COLORS[(index % #ROOF_COLORS) + 1]
	local model = Instance.new("Model"); model.Name = "House" .. index; model.Parent = folder
	-- floor
	part({ Name = "Floor", Size = Vector3.new(r.w, 1, r.d), CFrame = CFrame.new(r.x, 0.5, r.z), Material = Enum.Material.WoodPlanks, Color = Color3.fromRGB(120, 80, 50), Parent = model })
	local t = 1.2
	-- back wall, left wall, right wall
	part({ Name = "Wall", Size = Vector3.new(r.w, h, t), CFrame = CFrame.new(r.x, h / 2, r.z - r.d / 2), Material = Enum.Material.Brick, Color = wallColor, Parent = model })
	part({ Name = "Wall", Size = Vector3.new(t, h, r.d), CFrame = CFrame.new(r.x - r.w / 2, h / 2, r.z), Material = Enum.Material.Brick, Color = wallColor, Parent = model })
	part({ Name = "Wall", Size = Vector3.new(t, h, r.d), CFrame = CFrame.new(r.x + r.w / 2, h / 2, r.z), Material = Enum.Material.Brick, Color = wallColor, Parent = model })
	-- front wall with a door gap in the middle
	local doorW = 7
	local sideW = (r.w - doorW) / 2
	part({ Name = "Wall", Size = Vector3.new(sideW, h, t), CFrame = CFrame.new(r.x - doorW / 2 - sideW / 2, h / 2, r.z + r.d / 2), Material = Enum.Material.Brick, Color = wallColor, Parent = model })
	part({ Name = "Wall", Size = Vector3.new(sideW, h, t), CFrame = CFrame.new(r.x + doorW / 2 + sideW / 2, h / 2, r.z + r.d / 2), Material = Enum.Material.Brick, Color = wallColor, Parent = model })
	part({ Name = "Lintel", Size = Vector3.new(doorW, h - 10, t), CFrame = CFrame.new(r.x, 10 + (h - 10) / 2, r.z + r.d / 2), Material = Enum.Material.Brick, Color = wallColor, Parent = model })
	-- windows
	for _, side in ipairs({ -1, 1 }) do
		part({ Name = "Window", Size = Vector3.new(0.6, 5, 6), CFrame = CFrame.new(r.x + side * r.w / 2, 8, r.z), Material = Enum.Material.Glass, Color = Color3.fromRGB(150, 210, 255), Transparency = 0.4, Parent = model })
		part({ Name = "Frame", Size = Vector3.new(0.8, 5.6, 0.6), CFrame = CFrame.new(r.x + side * r.w / 2, 8, r.z), Material = Enum.Material.SmoothPlastic, Color = Color3.new(1, 1, 1), Parent = model })
	end
	part({ Name = "Window", Size = Vector3.new(6, 5, 0.6), CFrame = CFrame.new(r.x, 8, r.z - r.d / 2), Material = Enum.Material.Glass, Color = Color3.fromRGB(150, 210, 255), Transparency = 0.4, Parent = model })
	-- pitched roof: two wedges meeting at a ridge along the long axis
	local along = r.w >= r.d
	local span = if along then r.d else r.w
	local len = if along then r.w else r.d
	local roofH = span * 0.45
	for _, side in ipairs({ -1, 1 }) do
		local w = wedge({ Name = "Roof", Size = Vector3.new(len + 3, roofH, span / 2 + 1.5), Material = Enum.Material.Slate, Color = roofColor, Parent = model })
		local offset = side * (span / 4 + 0.75)
		local yaw = if along then 0 else math.pi / 2
		-- wedge slopes up towards -Z of its own frame; flip per side
		local face = if side == 1 then 0 else math.pi
		w.CFrame = CFrame.new(r.x, h + roofH / 2, r.z) * CFrame.Angles(0, yaw, 0) * CFrame.new(0, 0, offset) * CFrame.Angles(0, face, 0)
	end
	part({ Name = "Chimney", Size = Vector3.new(3, 6, 3), CFrame = CFrame.new(r.x + r.w / 4, h + roofH * 0.7 + 2, r.z - r.d / 4), Material = Enum.Material.Brick, Color = Color3.fromRGB(110, 70, 50), Parent = model })
end

local function buildTree(folder: Folder, pos: Vector3, kind: number)
	local model = Instance.new("Model"); model.Name = "Tree"; model.Parent = folder
	local scale = rnd(0.9, 1.5)
	if kind < 0.5 then -- round tree
		local trunkH = 12 * scale
		part({ Name = "Trunk", Shape = Enum.PartType.Cylinder, Size = Vector3.new(trunkH, 2.4 * scale, 2.4 * scale), CFrame = CFrame.new(pos.X, trunkH / 2, pos.Z) * CFrame.Angles(0, 0, math.pi / 2), Material = Enum.Material.Wood, Color = Color3.fromRGB(110, 60, 30), Parent = model })
		local greens = { Color3.fromRGB(62, 160, 40), Color3.fromRGB(90, 190, 50), Color3.fromRGB(46, 130, 35) }
		for i = 1, 4 do
			local a = i / 4 * math.pi * 2
			local rr = (5 + math.random() * 3) * scale
			part({ Name = "Leaves", Shape = Enum.PartType.Ball, Size = Vector3.new(rr * 2, rr * 2, rr * 2), CFrame = CFrame.new(pos.X + math.cos(a) * 3.5 * scale, trunkH + rr * 0.6, pos.Z + math.sin(a) * 3.5 * scale), Material = Enum.Material.Grass, Color = greens[(i % 3) + 1], CanCollide = false, Parent = model })
		end
		part({ Name = "Leaves", Shape = Enum.PartType.Ball, Size = Vector3.new(11 * scale, 11 * scale, 11 * scale), CFrame = CFrame.new(pos.X, trunkH + 6 * scale, pos.Z), Material = Enum.Material.Grass, Color = greens[2], CanCollide = false, Parent = model })
	else -- pine: tall trunk with stacked discs
		local trunkH = 20 * scale
		part({ Name = "Trunk", Shape = Enum.PartType.Cylinder, Size = Vector3.new(trunkH, 2 * scale, 2 * scale), CFrame = CFrame.new(pos.X, trunkH / 2, pos.Z) * CFrame.Angles(0, 0, math.pi / 2), Material = Enum.Material.Wood, Color = Color3.fromRGB(130, 55, 30), Parent = model })
		for i = 0, 3 do
			local rr = (8 - i * 1.7) * scale
			part({ Name = "Leaves", Shape = Enum.PartType.Cylinder, Size = Vector3.new(2.2 * scale, rr * 2, rr * 2), CFrame = CFrame.new(pos.X, trunkH * 0.45 + i * 4.2 * scale, pos.Z) * CFrame.Angles(0, 0, math.pi / 2), Material = Enum.Material.Grass, Color = if i % 2 == 0 then Color3.fromRGB(40, 125, 40) else Color3.fromRGB(60, 160, 50), CanCollide = false, Parent = model })
		end
		part({ Name = "Leaves", Shape = Enum.PartType.Ball, Size = Vector3.new(4 * scale, 4 * scale, 4 * scale), CFrame = CFrame.new(pos.X, trunkH * 0.45 + 4 * 4.2 * scale, pos.Z), Material = Enum.Material.Grass, Color = Color3.fromRGB(70, 170, 60), CanCollide = false, Parent = model })
	end
end

local function buildRock(folder: Folder, pos: Vector3)
	local s = rnd(4, 10)
	part({ Name = "Rock", Shape = Enum.PartType.Ball, Size = Vector3.new(s * rnd(1, 1.6), s * 0.8, s * rnd(1, 1.6)), CFrame = CFrame.new(pos.X, s * 0.3, pos.Z) * CFrame.Angles(0, math.random() * 3, 0), Material = Enum.Material.Slate, Color = Color3.fromRGB(130, 140, 145), Parent = folder })
end

local function setupLighting()
	Lighting.ClockTime = 14.2
	Lighting.Brightness = 2.6
	Lighting.Ambient = Color3.fromRGB(120, 130, 140)
	Lighting.OutdoorAmbient = Color3.fromRGB(140, 160, 175)
	Lighting.GlobalShadows = true
	Lighting.EnvironmentDiffuseScale = 0.6
	Lighting.EnvironmentSpecularScale = 0.6
	if not Lighting:FindFirstChildOfClass("Atmosphere") then
		local atm = Instance.new("Atmosphere"); atm.Density = 0.32; atm.Offset = 0.25; atm.Color = Color3.fromRGB(199, 220, 255); atm.Decay = Color3.fromRGB(106, 140, 190); atm.Glare = 0.3; atm.Haze = 1.2; atm.Parent = Lighting
	end
	if not Lighting:FindFirstChildOfClass("BloomEffect") then
		local bloom = Instance.new("BloomEffect"); bloom.Intensity = 0.4; bloom.Size = 24; bloom.Threshold = 1.5; bloom.Parent = Lighting
	end
	if not Lighting:FindFirstChildOfClass("SunRaysEffect") then
		local rays = Instance.new("SunRaysEffect"); rays.Intensity = 0.08; rays.Spread = 0.6; rays.Parent = Lighting
	end
	if not Lighting:FindFirstChildOfClass("ColorCorrectionEffect") then
		local cc = Instance.new("ColorCorrectionEffect"); cc.Saturation = 0.18; cc.Contrast = 0.08; cc.Parent = Lighting
	end
end

function MapBuilder.build(): MapInfo
	setupLighting()
	local folder = Instance.new("Folder"); folder.Name = "Map"; folder.Parent = workspace
	local terrain = workspace.Terrain
	-- flat grass island with hills around the edge
	terrain:FillBlock(CFrame.new(0, -10, 0), Vector3.new(SIZE + 60, 20, SIZE + 60), Enum.Material.Grass)
	terrain:FillBlock(CFrame.new(0, -30, 0), Vector3.new(SIZE * 3, 20, SIZE * 3), Enum.Material.Grass)
	for i = 1, 36 do
		local a = i / 36 * math.pi * 2
		local d = HALF + 140 + math.random(0, 160)
		local r = 70 + math.random(0, 110)
		terrain:FillBall(Vector3.new(math.cos(a) * d, -r * 0.35, math.sin(a) * d), r, Enum.Material.Grass)
		if i % 4 == 0 then terrain:FillBall(Vector3.new(math.cos(a) * d, r * 0.25, math.sin(a) * d), r * 0.35, Enum.Material.Snow) end
	end
	-- a pond
	local px, pz = HALF * 0.55, -HALF * 0.5
	terrain:FillBlock(CFrame.new(px, -4, pz), Vector3.new(90, 8, 70), Enum.Material.Air)
	terrain:FillBlock(CFrame.new(px, -4.5, pz), Vector3.new(90, 6, 70), Enum.Material.Water)
	terrain:FillBlock(CFrame.new(px, -9, pz), Vector3.new(96, 3, 76), Enum.Material.Sand)
	pcall(function() terrain.Decoration = true end)
	pcall(function() terrain.WaterTransparency = 0.6; terrain.WaterReflectance = 0.3 end)

	local houses: { Rect } = {}
	-- the vault in the middle: a special house holding legendary chests
	local vault: Rect = { x = 0, z = 0, w = 36, d = 30 }
	table.insert(houses, vault)
	buildHouse(folder, vault, 3)
	-- houses
	local tries = 0
	while #houses < 15 and tries < 400 do
		tries += 1
		local r: Rect = { x = rnd(-HALF + 60, HALF - 60), z = rnd(-HALF + 60, HALF - 60), w = rnd(22, 44), d = rnd(20, 40) }
		if math.abs(r.x - px) < 80 and math.abs(r.z - pz) < 70 then continue end
		if not overlaps(r, houses, 26) then table.insert(houses, r); buildHouse(folder, r, #houses) end
	end
	-- trees and rocks
	local trees: { Vector3 } = {}
	tries = 0
	while #trees < 70 and tries < 800 do
		tries += 1
		local x, z = rnd(-HALF + 20, HALF - 20), rnd(-HALF + 20, HALF - 20)
		if insideAny(x, z, houses, 12) or (math.abs(x - px) < 60 and math.abs(z - pz) < 50) then continue end
		local tooClose = false
		for _, t in ipairs(trees) do if (Vector3.new(x, 0, z) - t).Magnitude < 22 then tooClose = true; break end end
		if tooClose then continue end
		local pos = Vector3.new(x, 0, z); table.insert(trees, pos); buildTree(folder, pos, math.random())
	end
	for _ = 1, 22 do
		local x, z = rnd(-HALF + 20, HALF - 20), rnd(-HALF + 20, HALF - 20)
		if not insideAny(x, z, houses, 10) then buildRock(folder, Vector3.new(x, 0, z)) end
	end
	-- decorative trees beyond the walls
	for i = 1, 60 do
		local a = i / 60 * math.pi * 2 + math.random() * 0.1
		local d = HALF + 40 + math.random(0, 90)
		buildTree(folder, Vector3.new(math.cos(a) * d, 0, math.sin(a) * d), math.random())
	end
	-- boundary walls
	for _, w in ipairs({ { 0, -HALF - 2, SIZE + 4, 4 }, { 0, HALF + 2, SIZE + 4, 4 }, { -HALF - 2, 0, 4, SIZE + 4 }, { HALF + 2, 0, 4, SIZE + 4 } }) do
		part({ Name = "Boundary", Size = Vector3.new(w[3], 60, w[4]), CFrame = CFrame.new(w[1], 30, w[2]), Material = Enum.Material.ForceField, Color = Color3.fromRGB(255, 80, 80), Transparency = 0.5, Parent = folder })
	end
	-- spawn points around the edge
	for i = 1, 8 do
		local a = i / 8 * math.pi * 2
		local sp = Instance.new("SpawnLocation")
		sp.Size = Vector3.new(8, 1, 8); sp.CFrame = CFrame.new(math.cos(a) * (HALF - 50), 0.5, math.sin(a) * (HALF - 50))
		sp.Anchored = true; sp.Neutral = true; sp.Transparency = 1; sp.CanCollide = false; sp.Duration = 0; sp.Parent = folder
	end
	-- chest spots: inside houses sometimes, otherwise in the open
	local chestSpots: { Vector3 } = {}
	for _, h in ipairs(houses) do
		if h ~= vault and math.random() < 0.6 then table.insert(chestSpots, Vector3.new(h.x + rnd(-h.w / 4, h.w / 4), 1, h.z + rnd(-h.d / 4, h.d / 4))) end
	end
	tries = 0
	while #chestSpots < Config.CHEST_COUNT and tries < 800 do
		tries += 1
		local x, z = rnd(-HALF + 30, HALF - 30), rnd(-HALF + 30, HALF - 30)
		if insideAny(x, z, houses, 8) or (math.abs(x - px) < 60 and math.abs(z - pz) < 50) then continue end
		local ok = true
		for _, t in ipairs(trees) do if (Vector3.new(x, 0, z) - t).Magnitude < 10 then ok = false; break end end
		for _, c in ipairs(chestSpots) do if (Vector3.new(x, 1, z) - c).Magnitude < 40 then ok = false; break end end
		if ok then table.insert(chestSpots, Vector3.new(x, 1, z)) end
	end
	return { houses = houses, trees = trees, chestSpots = chestSpots, vault = vault, mapFolder = folder }
end

return MapBuilder
