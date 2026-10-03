--!nonstrict
-- Maths Royale server: chests locked by sums, guns that reload with sums, brain levels, storm waves,
-- respawn by sums, building walls with bricks earned from sums, scores and saving.
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerScriptService = game:GetService("ServerScriptService")
local RunService = game:GetService("RunService")
local Debris = game:GetService("Debris")
local TweenService = game:GetService("TweenService")
local DataStoreService = game:GetService("DataStoreService")

local Config = require(ReplicatedStorage:WaitForChild("Config"))
local Maths = require(ServerScriptService:WaitForChild("Maths"))
local MapBuilder = require(ServerScriptService:WaitForChild("MapBuilder"))
local Weapons = require(ServerScriptService:WaitForChild("Weapons"))

-- ---------- remotes ----------
local remotes = Instance.new("Folder"); remotes.Name = "Remotes"; remotes.Parent = ReplicatedStorage
local function remote(name: string): RemoteEvent
	local r = Instance.new("RemoteEvent"); r.Name = name; r.Parent = remotes; return r
end
local ShowQuestion = remote("ShowQuestion") -- server -> client
local Answer = remote("Answer") -- client -> server
local Result = remote("Result") -- server -> client
local Shoot = remote("Shoot") -- client -> server (target position)
local Reload = remote("Reload") -- client -> server
local Build = remote("Build") -- client -> server (wall CFrame)
local UseItem = remote("UseItem") -- client -> server
local Notify = remote("Notify") -- server -> client (text, colour)
local Tracer = remote("Tracer") -- server -> all clients (from, to, colour)

-- ---------- state ----------
type PlayerState = {
	level: number, runRight: number, runWrong: number, streak: number, history: { [string]: { right: number, wrong: number } },
	pending: { kind: string, q: Maths.Question, deadline: number, chest: any?, tool: Tool? }?,
	lastTopic: string?, lastShot: number, reloadPenaltyUntil: number, bricks: number, needsRespawnSum: boolean, walls: number,
	loaded: boolean, lastUse: number, respawnMisses: number,
}
local states: { [Player]: PlayerState } = {}
local function stateOf(p: Player): PlayerState
	local s = states[p]
	if not s then
		s = { level = 0, runRight = 0, runWrong = 0, streak = 0, history = {}, pending = nil, lastTopic = nil, lastShot = 0, reloadPenaltyUntil = 0, bricks = 6, needsRespawnSum = false, walls = 0, loaded = false, lastUse = 0, respawnMisses = 0 }
		states[p] = s
	end
	return s
end
local store = nil
pcall(function() store = DataStoreService:GetDataStore("MathsRoyaleV1") end)

local vaultInside: Vector3? = nil -- set once the map is built
local function attrNum(inst: Instance, name: string): number
	local v = inst:GetAttribute(name)
	return if type(v) == "number" then v else 0
end
local function notify(p: Player, text: string, color: Color3?) Notify:FireClient(p, text, color or Color3.new(1, 1, 1)) end
local function notifyAll(text: string, color: Color3?) Notify:FireAllClients(text, color or Color3.new(1, 1, 1)) end

-- ---------- leaderstats & attributes ----------
local function setupPlayer(p: Player)
	local s = stateOf(p)
	local ls = Instance.new("Folder"); ls.Name = "leaderstats"; ls.Parent = p
	local elims = Instance.new("IntValue"); elims.Name = "Elims"; elims.Parent = ls
	local sums = Instance.new("IntValue"); sums.Name = "Sums"; sums.Parent = ls
	local brain = Instance.new("IntValue"); brain.Name = "Brain"; brain.Value = 1; brain.Parent = ls
	p:SetAttribute("Shield", 0); p:SetAttribute("Bricks", s.bricks); p:SetAttribute("Streak", 0); p:SetAttribute("BrainXP", 0); p:SetAttribute("BrainLevel", 1)
	p:SetAttribute("SumsRight", 0); p:SetAttribute("SumsWrong", 0)
	if store then
		local ok, data = pcall(function() return (store :: any):GetAsync("p" .. p.UserId) end)
		if ok then
			s.loaded = true
			if type(data) == "table" then
				p:SetAttribute("BrainXP", data.xp or 0); p:SetAttribute("BrainLevel", math.clamp(math.floor((data.xp or 0) / 5) + 1, 1, 10)); brain.Value = p:GetAttribute("BrainLevel")
				p:SetAttribute("SumsRight", data.right or 0); p:SetAttribute("SumsWrong", data.wrong or 0)
				if type(data.history) == "table" then s.history = data.history end
				if type(data.level) == "number" then s.level = data.level end
			end
		else
			warn("Maths Royale: could not load saved progress for " .. p.Name .. " (progress will not be saved this session)")
		end
	end
end
local saved: { [Player]: boolean } = {}
local function savePlayer(p: Player)
	if not store then return end
	local s = states[p]; if not s or not s.loaded or saved[p] then return end
	saved[p] = true
	local payload = { xp = p:GetAttribute("BrainXP"), right = p:GetAttribute("SumsRight"), wrong = p:GetAttribute("SumsWrong"), history = s.history, level = s.level }
	local ok = pcall(function() (store :: any):UpdateAsync("p" .. p.UserId, function() return payload end) end)
	if not ok then saved[p] = nil end
end

-- ---------- maths bookkeeping (adaptive) ----------
local function weakTopics(s: PlayerState): { string }
	local out = {}
	for topic, v in pairs(s.history) do if v.wrong > v.right then table.insert(out, topic) end end
	return out
end
local function tierFor(rarity: string, s: PlayerState): number
	return math.clamp(Config.RARITY[rarity].tier + s.level, 1, 4)
end
local function recordAnswer(p: Player, q: Maths.Question, correct: boolean)
	local s = stateOf(p)
	local h = s.history[q.topic] or { right = 0, wrong = 0 }; s.history[q.topic] = h
	local ls = p:FindFirstChild("leaderstats"); local sums = ls and ls:FindFirstChild("Sums")
	if correct then
		h.right += 1; s.runRight += 1; s.runWrong = 0; s.streak += 1
		p:SetAttribute("SumsRight", attrNum(p, "SumsRight") + 1)
		if sums then sums.Value += 1 end
		local xp = attrNum(p, "BrainXP") + 1; p:SetAttribute("BrainXP", xp)
		local lvl = math.clamp(math.floor(xp / 5) + 1, 1, 10)
		if lvl > attrNum(p, "BrainLevel") then p:SetAttribute("BrainLevel", lvl); local brainV = ls and ls:FindFirstChild("Brain"); if brainV then brainV.Value = lvl end; notify(p, "🧠 Brain level " .. lvl .. "! Your guns now do more damage.", Color3.fromRGB(255, 211, 77)) end
		s.bricks += Config.BRICKS_PER_SUM; p:SetAttribute("Bricks", s.bricks)
		if s.streak % 3 == 0 then p:SetAttribute("Shield", math.min(100, attrNum(p, "Shield") + 25)); notify(p, "🔥 " .. s.streak .. " sums in a row! +25 shield", Color3.fromRGB(255, 150, 50)) end
		if s.runRight >= 3 and s.level < 1 then s.level += 1; s.runRight = 0; notify(p, "📈 Nice! Your sums are getting harder (and the loot better).") end
	else
		h.wrong += 1; s.runWrong += 1; s.runRight = 0; s.streak = 0
		p:SetAttribute("SumsWrong", attrNum(p, "SumsWrong") + 1)
		local xp = math.max(0, attrNum(p, "BrainXP") - 1); p:SetAttribute("BrainXP", xp)
		local lvl = math.clamp(math.floor(xp / 5) + 1, 1, 10)
		if lvl < attrNum(p, "BrainLevel") then p:SetAttribute("BrainLevel", lvl); local brainV = ls and ls:FindFirstChild("Brain"); if brainV then brainV.Value = lvl end end
		if s.runWrong >= 2 and s.level > -1 then s.level -= 1; s.runWrong = 0; notify(p, "📉 No worries, the next sums will be a bit easier.") end
	end
	p:SetAttribute("Streak", s.streak)
end

-- ---------- character helpers ----------
local function root(p: Player): BasePart?
	local c = p.Character; if not c then return nil end
	return c:FindFirstChild("HumanoidRootPart") :: BasePart?
end
local function humanoid(p: Player): Humanoid?
	local c = p.Character; if not c then return nil end
	return c:FindFirstChildOfClass("Humanoid")
end
local function freeze(p: Player, on: boolean)
	local hum = humanoid(p); if not hum then return end
	hum.WalkSpeed = if on then 0 else 16
	hum.JumpPower = if on then 0 else 50
	hum.JumpHeight = if on then 0 else 7.2
end
local function busyWithSum(s: PlayerState): boolean
	return s.needsRespawnSum or (s.pending ~= nil and s.pending.kind ~= "reload")
end
local function damagePlayer(victim: Player, amount: number, attacker: Player?)
	local hum = humanoid(victim); if not hum or hum.Health <= 0 then return end
	local s = stateOf(victim)
	if busyWithSum(s) then return end -- thinking about a sum, or waiting to respawn: can't be hurt
	local shield = victim:GetAttribute("Shield") or 0
	if shield > 0 then local take = math.min(shield, amount); victim:SetAttribute("Shield", shield - take); amount -= take end
	if amount > 0 then
		if attacker then hum:SetAttribute("LastHitBy", attacker.UserId); hum:SetAttribute("LastHitAt", os.clock()) end
		hum:TakeDamage(amount)
	end
end

-- ---------- questions ----------
local function askQuestion(p: Player, kind: string, q: Maths.Question, timeLimit: number, rarity: string?, chest: any?)
	local s = stateOf(p)
	s.pending = { kind = kind, q = q, deadline = os.clock() + timeLimit, chest = chest }
	s.lastTopic = q.topic
	if kind == "chest" or kind == "respawn" then freeze(p, true) end
	ShowQuestion:FireClient(p, { kind = kind, text = q.text, topic = q.topic, hint = q.hint, rarity = rarity or "common", timeLimit = timeLimit })
end

-- ---------- chests ----------
type Chest = { model: Model, body: Part, lid: Part, light: PointLight, glow: SelectionBox, prompt: ProximityPrompt, rarity: string, open: boolean, busy: Player?, lockedUntil: number, reopenAt: number, legendaryOnly: boolean }
local chests: { Chest } = {}
local function setChestRarity(c: Chest, rarity: string)
	c.rarity = rarity
	local col = Config.RARITY[rarity].color
	c.light.Color = col; c.glow.Color3 = col; c.glow.SurfaceColor3 = col
	c.prompt.ObjectText = Config.RARITY[rarity].label .. " chest"
	for _, band in ipairs(c.model:GetChildren()) do if band.Name == "Band" then (band :: Part).Color = col end end
end
local function makeChest(pos: Vector3, legendaryOnly: boolean): Chest
	local model = Instance.new("Model"); model.Name = "Chest"
	local body = Instance.new("Part"); body.Name = "Body"; body.Size = Vector3.new(4, 2.4, 2.8); body.CFrame = CFrame.new(pos + Vector3.new(0, 1.2, 0)) * CFrame.Angles(0, math.random() * math.pi * 2, 0)
	body.Anchored = true; body.Material = Enum.Material.WoodPlanks; body.Color = Color3.fromRGB(141, 90, 43); body.Parent = model
	local lid = Instance.new("Part"); lid.Name = "Lid"; lid.Size = Vector3.new(4, 1, 2.8); lid.CFrame = body.CFrame * CFrame.new(0, 1.7, 0)
	lid.Anchored = true; lid.Material = Enum.Material.WoodPlanks; lid.Color = Color3.fromRGB(109, 67, 32); lid.Parent = model
	for _, x in ipairs({ -1.2, 1.2 }) do
		local band = Instance.new("Part"); band.Name = "Band"; band.Size = Vector3.new(0.4, 3.5, 3.0); band.CFrame = body.CFrame * CFrame.new(x, 0.5, 0)
		band.Anchored = true; band.Material = Enum.Material.Neon; band.CanCollide = false; band.Parent = model
	end
	local lock = Instance.new("Part"); lock.Name = "Lock"; lock.Size = Vector3.new(0.7, 0.9, 0.3); lock.CFrame = body.CFrame * CFrame.new(0, 0.9, 1.5)
	lock.Anchored = true; lock.Material = Enum.Material.Metal; lock.Color = Color3.fromRGB(255, 211, 77); lock.CanCollide = false; lock.Parent = model
	local light = Instance.new("PointLight"); light.Range = 14; light.Brightness = 2; light.Parent = body
	local glow = Instance.new("SelectionBox"); glow.Adornee = body; glow.LineThickness = 0.06; glow.SurfaceTransparency = 0.85; glow.Transparency = 0.1; glow.Parent = model
	local prompt = Instance.new("ProximityPrompt"); prompt.ActionText = "Solve a sum to open"; prompt.HoldDuration = 0; prompt.MaxActivationDistance = 9; prompt.RequiresLineOfSight = true; prompt.Parent = body
	model.Parent = workspace:FindFirstChild("Map") or workspace
	local c: Chest = { model = model, body = body, lid = lid, light = light, glow = glow, prompt = prompt, rarity = "common", open = false, busy = nil, lockedUntil = 0, reopenAt = 0, legendaryOnly = legendaryOnly }
	setChestRarity(c, if legendaryOnly then "legendary" else Weapons.rollRarity())
	prompt.Triggered:Connect(function(p)
		local s = stateOf(p)
		if c.open or s.pending or s.needsRespawnSum then return end
		if c.busy then notify(p, "Someone else is opening that chest."); return end
		if os.clock() < c.lockedUntil then notify(p, "That chest is locked for a moment. Try another!"); return end
		c.busy = p
		local q = Maths.generate(tierFor(c.rarity, s), p.Name, s.lastTopic, weakTopics(s))
		askQuestion(p, "chest", q, Config.QUESTION_TIME + (q.tier - 1) * 10, c.rarity, c)
	end)
	return c
end
local function openChest(c: Chest, p: Player)
	c.open = true; c.busy = nil; c.reopenAt = os.clock() + Config.CHEST_RESPAWN
	c.light.Enabled = false; c.glow.Visible = false; c.prompt.Enabled = false
	TweenService:Create(c.lid, TweenInfo.new(0.5, Enum.EasingStyle.Back), { CFrame = c.body.CFrame * CFrame.new(0, 2.3, -1.2) * CFrame.Angles(-1.6, 0, 0) }):Play()
	local names = {}
	local bp = p:FindFirstChild("Backpack"); local char = p.Character
	local function owned(): { Tool }
		local out = {}
		for _, holder in ipairs({ bp, char }) do if holder then for _, t in ipairs(holder:GetChildren()) do if t:IsA("Tool") then table.insert(out, t) end end end end
		return out
	end
	for _, tool in ipairs(Weapons.makeLoot(c.rarity)) do
		table.insert(names, tool.Name)
		local kind = tool:GetAttribute("Consumable")
		local merged = false
		if kind then
			for _, t in ipairs(owned()) do
				if t:GetAttribute("Consumable") == kind then t:SetAttribute("Count", attrNum(t, "Count") + attrNum(tool, "Count")); merged = true; break end
			end
		end
		if merged then tool:Destroy() else tool.Parent = bp end
	end
	-- keep at most 3 guns: drop the weakest extra ones
	local guns = {}
	for _, t in ipairs(owned()) do if t:GetAttribute("Weapon") then table.insert(guns, t) end end
	table.sort(guns, function(a, b) return Config.RARITY[a:GetAttribute("Rarity") or "common"].tier < Config.RARITY[b:GetAttribute("Rarity") or "common"].tier end)
	while #guns > 3 do local t = table.remove(guns, 1); if t then notify(p, "Bag full: dropped your " .. t.Name); t:Destroy() end end
	return names
end
local function closeChest(c: Chest)
	c.open = false; c.lid.CFrame = c.body.CFrame * CFrame.new(0, 1.7, 0)
	c.light.Enabled = true; c.glow.Visible = true; c.prompt.Enabled = true
	setChestRarity(c, if c.legendaryOnly then "legendary" else Weapons.rollRarity())
end

-- ---------- answers ----------
local function finishQuestion(p: Player, correct: boolean, timedOut: boolean)
	local s = stateOf(p); local pend = s.pending; if not pend then return end
	s.pending = nil
	recordAnswer(p, pend.q, correct)
	if pend.kind == "chest" then
		freeze(p, false)
		local c = pend.chest :: Chest
		local loot = {}
		if correct then loot = openChest(c, p) else c.busy = nil; c.lockedUntil = os.clock() + 4 end
		Result:FireClient(p, { kind = "chest", correct = correct, answer = pend.q.display, loot = loot, timeout = timedOut })
	elseif pend.kind == "reload" then
		local tool = pend.tool
		if tool and tool.Parent then
			local mag = tool:GetAttribute("Mag") or 10
			if correct then tool:SetAttribute("Ammo", mag) else s.reloadPenaltyUntil = os.clock() + 2; task.delay(2, function() if tool.Parent then tool:SetAttribute("Ammo", math.max(attrNum(tool, "Ammo"), math.max(1, math.floor(mag / 2)))) end end) end
		end
		Result:FireClient(p, { kind = "reload", correct = correct, answer = pend.q.display, timeout = timedOut })
	elseif pend.kind == "gate" then
		freeze(p, false)
		Result:FireClient(p, { kind = "gate", correct = correct, answer = pend.q.display, timeout = timedOut })
		if correct and vaultInside then local r = root(p); if r then r.CFrame = CFrame.new(vaultInside) end end
	elseif pend.kind == "respawn" then
		Result:FireClient(p, { kind = "respawn", correct = correct, answer = pend.q.display, timeout = timedOut })
		if correct then s.needsRespawnSum = false; s.respawnMisses = 0; freeze(p, false); notify(p, "Back in the game! Go find a chest.", Color3.fromRGB(46, 213, 115))
		else
			s.respawnMisses += 1
			if s.respawnMisses >= 3 then
				s.needsRespawnSum = false; s.respawnMisses = 0; freeze(p, false); notify(p, "Tough one! You're back in anyway. Keep practising.", Color3.fromRGB(255, 211, 77))
			else
				task.delay(2.5, function() if s.needsRespawnSum and not s.pending and p.Parent then askQuestion(p, "respawn", Maths.generate(1, p.Name, s.lastTopic, weakTopics(s)), Config.RESPAWN_QUESTION_TIME) end end)
			end
		end
	end
end
Answer.OnServerEvent:Connect(function(p, text)
	local s = stateOf(p); local pend = s.pending
	if not pend or type(text) ~= "string" then return end
	finishQuestion(p, Maths.check(pend.q, text:sub(1, 40)), false)
end)

-- ---------- shooting ----------
local function equippedTool(p: Player): Tool?
	local c = p.Character; if not c then return nil end
	return c:FindFirstChildOfClass("Tool")
end
local function spawnTracer(from: Vector3, to: Vector3, color: Color3)
	Tracer:FireAllClients(from, to, color)
end
Shoot.OnServerEvent:Connect(function(p, target)
	if typeof(target) ~= "Vector3" then return end
	local s = stateOf(p); if s.pending or s.needsRespawnSum then return end
	local tool = equippedTool(p); if not tool then return end
	local key = tool:GetAttribute("Weapon"); if type(key) ~= "string" then return end
	local def = Config.WEAPONS[key]; if not def then return end
	local now = os.clock()
	if now - s.lastShot < def.rate * 0.9 then return end
	local ammo = tool:GetAttribute("Ammo") or 0
	if ammo <= 0 then return end
	local handle = tool:FindFirstChild("Handle") :: BasePart?; local r = root(p)
	if not handle or not r then return end
	s.lastShot = now; tool:SetAttribute("Ammo", ammo - 1)
	local origin = handle.Position
	local baseDir = (target - origin)
	if baseDir.Magnitude < 1 then return end
	baseDir = baseDir.Unit
	local params = RaycastParams.new(); params.FilterType = Enum.RaycastFilterType.Exclude; params.FilterDescendantsInstances = { p.Character :: Instance }
	local mult = Config.RARITY[tool:GetAttribute("Rarity") or "common"].mult * (1 + 0.1 * ((p:GetAttribute("BrainLevel") or 1) - 1))
	for _ = 1, def.pellets do
		local dir = (baseDir + Vector3.new((math.random() - 0.5) * 2 * def.spread, (math.random() - 0.5) * 2 * def.spread, (math.random() - 0.5) * 2 * def.spread)).Unit
		local hit = workspace:Raycast(origin, dir * def.range, params)
		local endPos = if hit then hit.Position else origin + dir * def.range
		spawnTracer(origin, endPos, Config.RARITY[tool:GetAttribute("Rarity") or "common"].color)
		if hit and hit.Instance then
			local model = hit.Instance:FindFirstAncestorOfClass("Model")
			local victim = model and Players:GetPlayerFromCharacter(model)
			if victim and victim ~= p then
				damagePlayer(victim, math.round(def.dmg * mult), p)
				Notify:FireClient(p, "hit", Color3.new(1, 1, 1))
			elseif hit.Instance:GetAttribute("WallHealth") then
				local wh = (hit.Instance:GetAttribute("WallHealth") :: number) - def.dmg
				if wh <= 0 then hit.Instance:Destroy() else hit.Instance:SetAttribute("WallHealth", wh) end
			end
		end
	end
	if ammo - 1 <= 0 then Reload:FireClient(p) end -- the client shows "press R"
end)
-- reload = quick sum
Reload.OnServerEvent:Connect(function(p)
	local s = stateOf(p); if s.pending or s.needsRespawnSum or os.clock() < s.reloadPenaltyUntil then return end
	local tool = equippedTool(p); if not tool or not tool:GetAttribute("Weapon") then return end
	if (tool:GetAttribute("Ammo") or 0) >= (tool:GetAttribute("Mag") or 0) then return end
	local q = Maths.generate(1, p.Name, s.lastTopic, weakTopics(s))
	s.pending = { kind = "reload", q = q, deadline = os.clock() + Config.RELOAD_QUIZ_TIME, chest = nil, tool = tool }
	s.lastTopic = q.topic
	ShowQuestion:FireClient(p, { kind = "reload", text = q.text, topic = q.topic, hint = nil, rarity = "common", timeLimit = Config.RELOAD_QUIZ_TIME })
end)
-- healing and shields
UseItem.OnServerEvent:Connect(function(p)
	local s = stateOf(p); if s.needsRespawnSum or os.clock() - s.lastUse < 0.6 then return end
	s.lastUse = os.clock()
	local tool = equippedTool(p); if not tool then return end
	local key = tool:GetAttribute("Consumable"); if type(key) ~= "string" then return end
	local def = Config.CONSUMABLES[key]; local hum = humanoid(p); if not def or not hum then return end
	if def.heal then
		if hum.Health >= def.maxTo then notify(p, "You're already healthy enough for that."); return end
		hum.Health = math.min(def.maxTo, hum.Health + def.heal)
	else
		local sh = p:GetAttribute("Shield") or 0
		if sh >= def.maxTo then notify(p, "Your shield is already full enough for that."); return end
		p:SetAttribute("Shield", math.min(def.maxTo, sh + def.shield))
	end
	local count = (tool:GetAttribute("Count") or 1) - 1
	if count <= 0 then tool:Destroy() else tool:SetAttribute("Count", count) end
end)
-- building walls with bricks
Build.OnServerEvent:Connect(function(p, cf)
	if typeof(cf) ~= "CFrame" then return end
	local s = stateOf(p); local r = root(p); if not r or s.pending or s.needsRespawnSum then return end
	if (cf.Position - r.Position).Magnitude > 14 then return end
	if s.bricks <= 0 then notify(p, "No bricks! Solve sums to earn bricks.", Color3.fromRGB(255, 107, 107)); return end
	s.bricks -= 1; p:SetAttribute("Bricks", s.bricks)
	local wall = Instance.new("Part"); wall.Name = "Wall"; wall.Size = Vector3.new(10, 9, 1); wall.CFrame = cf; wall.Anchored = true
	wall.Material = Enum.Material.WoodPlanks; wall.Color = Color3.fromRGB(190, 140, 80); wall:SetAttribute("WallHealth", Config.WALL_HEALTH)
	wall.Parent = workspace:FindFirstChild("Map") or workspace
	Debris:AddItem(wall, 120)
end)

-- ---------- players ----------
local function giveStarterKit(p: Player)
	local bp = p:FindFirstChild("Backpack"); if not bp then return end
	Weapons.makeTool("pistol", "common").Parent = bp
end
local function onPlayerAdded(p: Player)
	setupPlayer(p)
	local function onCharacter(char: Model)
		local s = stateOf(p)
		p:SetAttribute("Shield", 0)
		local hum = char:WaitForChild("Humanoid") :: Humanoid
		hum.Died:Connect(function()
			if s.pending and s.pending.chest then (s.pending.chest :: Chest).busy = nil end
			if s.pending then Result:FireClient(p, { kind = "cancel" }) end
			s.needsRespawnSum = true; s.pending = nil
			local killerId = hum:GetAttribute("LastHitBy"); local hitAt = hum:GetAttribute("LastHitAt")
			local recent = type(hitAt) == "number" and os.clock() - hitAt < 10
			local killer = if recent and type(killerId) == "number" then Players:GetPlayerByUserId(killerId) else nil
			if killer and killer ~= p then
				local ls = killer:FindFirstChild("leaderstats"); if ls then (ls :: any).Elims.Value += 1 end
				notifyAll("💥 " .. killer.Name .. " eliminated " .. p.Name, Color3.fromRGB(255, 211, 77))
				notify(killer, "+1 ELIMINATION", Color3.fromRGB(255, 211, 77))
			else
				notifyAll("💀 " .. p.Name .. " was eliminated", Color3.fromRGB(200, 200, 200))
			end
		end)
		task.wait(0.3)
		giveStarterKit(p)
		if s.needsRespawnSum then
			task.wait(0.5)
			askQuestion(p, "respawn", Maths.generate(1, p.Name, s.lastTopic, weakTopics(s)), Config.RESPAWN_QUESTION_TIME)
			notify(p, "Solve the sum to get back in!", Color3.fromRGB(255, 211, 77))
		else
			notify(p, "Welcome to Maths Royale! Find a chest and solve the sum.", Color3.fromRGB(255, 211, 77))
		end
	end
	p.CharacterAdded:Connect(onCharacter)
	if p.Character then task.spawn(onCharacter, p.Character) end
end
Players.PlayerAdded:Connect(onPlayerAdded)
for _, p in ipairs(Players:GetPlayers()) do task.spawn(onPlayerAdded, p) end
Players.PlayerRemoving:Connect(function(p)
	local s = states[p]
	if s and s.pending and s.pending.chest then (s.pending.chest :: Chest).busy = nil end
	savePlayer(p); states[p] = nil
end)
game:BindToClose(function() for _, p in ipairs(Players:GetPlayers()) do savePlayer(p) end end)

-- ---------- world ----------
local info = MapBuilder.build()
for _, spot in ipairs(info.chestSpots) do table.insert(chests, makeChest(spot, false)) end
-- legendary chests inside the vault
for _, dx in ipairs({ -8, 8 }) do table.insert(chests, makeChest(Vector3.new(info.vault.x + dx, 1, info.vault.z - 4), true)) end
-- the vault door: a maths gate that teleports you inside for a hard sum
do
	local door = Instance.new("Part"); door.Name = "VaultGate"; door.Size = Vector3.new(7, 10, 1); door.CFrame = CFrame.new(info.vault.x, 5, info.vault.z + info.vault.d / 2)
	door.Anchored = true; door.Material = Enum.Material.Neon; door.Color = Config.RARITY.legendary.color; door.Transparency = 0.4; door.Parent = info.mapFolder
	local prompt = Instance.new("ProximityPrompt"); prompt.ActionText = "Solve a hard sum to enter the vault"; prompt.ObjectText = "Maths gate"; prompt.HoldDuration = 0; prompt.MaxActivationDistance = 10; prompt.RequiresLineOfSight = false; prompt.Parent = door
	prompt.Triggered:Connect(function(p)
		local s = stateOf(p); if s.pending or s.needsRespawnSum then return end
		local q = Maths.generate(math.clamp(3 + s.level, 2, 4), p.Name, s.lastTopic, weakTopics(s))
		s.pending = { kind = "gate", q = q, deadline = os.clock() + 45, chest = nil }
		freeze(p, true)
		ShowQuestion:FireClient(p, { kind = "gate", text = q.text, topic = q.topic, hint = q.hint, rarity = "legendary", timeLimit = 45 })
	end)
end
vaultInside = Vector3.new(info.vault.x, 4, info.vault.z + 2)
do -- exit pad: step on it to leave the vault
	local pad = Instance.new("Part"); pad.Name = "VaultExit"; pad.Size = Vector3.new(6, 0.4, 6); pad.CFrame = CFrame.new(info.vault.x, 1.2, info.vault.z + 8)
	pad.Anchored = true; pad.Material = Enum.Material.Neon; pad.Color = Color3.fromRGB(80, 200, 255); pad.Parent = info.mapFolder
	local label = Instance.new("BillboardGui"); label.Size = UDim2.new(0, 120, 0, 30); label.StudsOffset = Vector3.new(0, 3, 0); label.AlwaysOnTop = true; label.Parent = pad
	local text = Instance.new("TextLabel"); text.Size = UDim2.fromScale(1, 1); text.BackgroundTransparency = 1; text.TextColor3 = Color3.new(1, 1, 1); text.TextStrokeTransparency = 0.3; text.TextScaled = true; text.Font = Enum.Font.GothamBold; text.Text = "EXIT"; text.Parent = label
	local lastExit: { [Player]: number } = {}
	pad.Touched:Connect(function(hit)
		local model = hit:FindFirstAncestorOfClass("Model"); local p = model and Players:GetPlayerFromCharacter(model)
		if not p then return end
		if os.clock() - (lastExit[p] or 0) < 2 then return end
		lastExit[p] = os.clock()
		local r = root(p); if r then r.CFrame = CFrame.new(info.vault.x, 4, info.vault.z + info.vault.d / 2 + 6) end
	end)
end

-- ---------- storm waves ----------
local storm = Instance.new("Part"); storm.Name = "Storm"; storm.Shape = Enum.PartType.Cylinder; storm.Anchored = true; storm.CanCollide = false
storm.Material = Enum.Material.ForceField; storm.Color = Color3.fromRGB(150, 60, 220); storm.Transparency = 0.45; storm.CastShadow = false
storm.CanQuery = false; storm.CanTouch = false; storm.CFrame = CFrame.new(0, 60, 0) * CFrame.Angles(0, 0, math.pi / 2); storm.Size = Vector3.new(120, 1, 1); storm.Transparency = 1; storm.Parent = workspace
local stormRadius = math.huge; local stormCenter = Vector3.new(0, 0, 0); local stormActive = false
task.spawn(function()
	while true do
		task.wait(Config.STORM_PERIOD)
		stormCenter = Vector3.new(math.random(-200, 200), 0, math.random(-200, 200)); stormActive = true; storm.Transparency = 0.45
		notifyAll("🌀 STORM! Get inside the purple circle!", Color3.fromRGB(200, 120, 255))
		local t0 = os.clock()
		while os.clock() - t0 < Config.STORM_SHRINK_TIME do
			local f = (os.clock() - t0) / Config.STORM_SHRINK_TIME
			stormRadius = Config.MAP_SIZE * 0.75 * (1 - f) + 40
			storm.Size = Vector3.new(120, stormRadius * 2, stormRadius * 2); storm.CFrame = CFrame.new(stormCenter.X, 60, stormCenter.Z) * CFrame.Angles(0, 0, math.pi / 2)
			task.wait(0.2)
		end
		task.wait(25)
		stormActive = false; stormRadius = math.huge; storm.Size = Vector3.new(120, 1, 1); storm.Transparency = 1
		notifyAll("The storm has passed.", Color3.fromRGB(200, 200, 200))
	end
end)

-- ---------- main loop: timeouts, chest reopen, storm damage ----------
local acc = 0
RunService.Heartbeat:Connect(function(dt)
	acc += dt
	if acc < 0.5 then return end
	acc = 0
	local now = os.clock()
	for p, s in pairs(states) do
		if s.pending and now > s.pending.deadline then finishQuestion(p, false, true) end
		if stormActive then
			local r = root(p)
			if r and (Vector3.new(r.Position.X, 0, r.Position.Z) - stormCenter).Magnitude > stormRadius then damagePlayer(p, Config.STORM_DAMAGE * 0.5, nil) end
		end
	end
	for _, c in ipairs(chests) do if c.open and now >= c.reopenAt then closeChest(c) end end
end)
print("Maths Royale server ready: " .. #chests .. " chests")
