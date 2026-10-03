--!nonstrict
-- Maths Royale client: sums pop-up, HUD, shooting, building, tracers, notifications.
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local UserInputService = game:GetService("UserInputService")
local RunService = game:GetService("RunService")
local Debris = game:GetService("Debris")
local ContextActionService = game:GetService("ContextActionService")

local Config = require(ReplicatedStorage:WaitForChild("Config"))
local remotes = ReplicatedStorage:WaitForChild("Remotes")
local ShowQuestion = remotes:WaitForChild("ShowQuestion") :: RemoteEvent
local Answer = remotes:WaitForChild("Answer") :: RemoteEvent
local Result = remotes:WaitForChild("Result") :: RemoteEvent
local Shoot = remotes:WaitForChild("Shoot") :: RemoteEvent
local Reload = remotes:WaitForChild("Reload") :: RemoteEvent
local Build = remotes:WaitForChild("Build") :: RemoteEvent
local UseItem = remotes:WaitForChild("UseItem") :: RemoteEvent
local Notify = remotes:WaitForChild("Notify") :: RemoteEvent
local Tracer = remotes:WaitForChild("Tracer") :: RemoteEvent

local player = Players.LocalPlayer
local mouse = player:GetMouse()
local playerGui = player:WaitForChild("PlayerGui")

-- ---------- UI helpers ----------
local function mk(class: string, props: { [string]: any }, parent: Instance?): any
	local inst = Instance.new(class)
	for k, v in pairs(props) do (inst :: any)[k] = v end
	if parent then inst.Parent = parent end
	return inst
end
local function corner(parent: Instance, r: number) mk("UICorner", { CornerRadius = UDim.new(0, r) }, parent) end
local FONT = Enum.Font.GothamBold
local DARK = Color3.fromRGB(22, 34, 47)
local BORDER = Color3.fromRGB(44, 74, 107)

local gui = mk("ScreenGui", { Name = "MathsRoyale", ResetOnSpawn = false, IgnoreGuiInset = true, ZIndexBehavior = Enum.ZIndexBehavior.Sibling }, playerGui)

-- HUD: top centre info, bottom shield bar, ammo, bricks
local hud = mk("Frame", { Size = UDim2.fromScale(1, 1), BackgroundTransparency = 1 }, gui)
local info = mk("TextLabel", { Size = UDim2.new(0, 420, 0, 28), Position = UDim2.new(0.5, -210, 0, 8), BackgroundTransparency = 1, TextColor3 = Color3.new(1, 1, 1), Font = FONT, TextSize = 18, Text = "", TextStrokeTransparency = 0.4 }, hud)
local shieldBg = mk("Frame", { Size = UDim2.new(0, 220, 0, 16), Position = UDim2.new(0, 16, 1, -96), BackgroundColor3 = Color3.fromRGB(0, 0, 0), BackgroundTransparency = 0.4, BorderSizePixel = 0 }, hud); corner(shieldBg, 6)
local shieldFill = mk("Frame", { Size = UDim2.new(0, 0, 1, 0), BackgroundColor3 = Color3.fromRGB(59, 157, 255), BorderSizePixel = 0 }, shieldBg); corner(shieldFill, 6)
local shieldText = mk("TextLabel", { Size = UDim2.fromScale(1, 1), BackgroundTransparency = 1, TextColor3 = Color3.new(1, 1, 1), Font = FONT, TextSize = 12, Text = "SHIELD 0", TextStrokeTransparency = 0.5 }, shieldBg)
local ammoLabel = mk("TextLabel", { Size = UDim2.new(0, 220, 0, 30), Position = UDim2.new(1, -236, 1, -130), BackgroundTransparency = 1, TextColor3 = Color3.new(1, 1, 1), Font = FONT, TextSize = 26, TextXAlignment = Enum.TextXAlignment.Right, Text = "", TextStrokeTransparency = 0.4 }, hud)
local _hintLabel = mk("TextLabel", { Size = UDim2.new(0, 320, 0, 20), Position = UDim2.new(1, -336, 1, -100), BackgroundTransparency = 1, TextColor3 = Color3.fromRGB(220, 230, 240), Font = Enum.Font.Gotham, TextSize = 13, TextXAlignment = Enum.TextXAlignment.Right, Text = "R = reload (quick sum)   F = build wall   click = shoot", TextStrokeTransparency = 0.5 }, hud)
local bricksLabel = mk("TextLabel", { Size = UDim2.new(0, 220, 0, 22), Position = UDim2.new(0, 16, 1, -122), BackgroundTransparency = 1, TextColor3 = Color3.fromRGB(255, 211, 77), Font = FONT, TextSize = 16, TextXAlignment = Enum.TextXAlignment.Left, Text = "🧱 Bricks: 6", TextStrokeTransparency = 0.4 }, hud)
local crosshair = mk("TextLabel", { Size = UDim2.new(0, 30, 0, 30), Position = UDim2.new(0.5, -15, 0.5, -15), BackgroundTransparency = 1, TextColor3 = Color3.new(1, 1, 1), Font = FONT, TextSize = 26, Text = "+", TextStrokeTransparency = 0.3, Visible = false }, hud)
local toast = mk("TextLabel", { Size = UDim2.new(0, 620, 0, 44), Position = UDim2.new(0.5, -310, 0.2, 0), BackgroundColor3 = Color3.fromRGB(0, 0, 0), BackgroundTransparency = 0.35, TextColor3 = Color3.new(1, 1, 1), Font = FONT, TextSize = 22, Text = "", Visible = false, TextWrapped = true }, hud); corner(toast, 10)
local feed = mk("Frame", { Size = UDim2.new(0, 360, 0, 140), Position = UDim2.new(0, 16, 1, -290), BackgroundTransparency = 1, ClipsDescendants = true }, hud)
mk("UIListLayout", { SortOrder = Enum.SortOrder.LayoutOrder, Padding = UDim.new(0, 4) }, feed)

-- Question box
local qFrame = mk("Frame", { Size = UDim2.new(0, 560, 0, 290), Position = UDim2.new(0.5, -280, 0.5, -160), BackgroundColor3 = DARK, Visible = false, BorderSizePixel = 0 }, gui); corner(qFrame, 16)
mk("UIStroke", { Color = BORDER, Thickness = 2 }, qFrame)
local qHeader = mk("TextLabel", { Size = UDim2.new(1, -40, 0, 36), Position = UDim2.new(0, 20, 0, 16), BackgroundColor3 = Color3.fromRGB(40, 60, 80), TextColor3 = Color3.new(1, 1, 1), Font = FONT, TextSize = 16, Text = "" }, qFrame); corner(qHeader, 8)
local qTopic = mk("TextLabel", { Size = UDim2.new(1, -40, 0, 18), Position = UDim2.new(0, 20, 0, 58), BackgroundTransparency = 1, TextColor3 = Color3.fromRGB(159, 179, 200), Font = Enum.Font.Gotham, TextSize = 14, Text = "" }, qFrame)
local qText = mk("TextLabel", { Size = UDim2.new(1, -40, 0, 90), Position = UDim2.new(0, 20, 0, 80), BackgroundTransparency = 1, TextColor3 = Color3.new(1, 1, 1), Font = FONT, TextSize = 26, TextWrapped = true, Text = "" }, qFrame)
local qHint = mk("TextLabel", { Size = UDim2.new(1, -40, 0, 16), Position = UDim2.new(0, 20, 0, 170), BackgroundTransparency = 1, TextColor3 = Color3.fromRGB(159, 179, 200), Font = Enum.Font.Gotham, TextSize = 13, Text = "" }, qFrame)
local qInput = mk("TextBox", { Size = UDim2.new(1, -190, 0, 46), Position = UDim2.new(0, 20, 0, 192), BackgroundColor3 = Color3.fromRGB(15, 24, 33), TextColor3 = Color3.new(1, 1, 1), Font = FONT, TextSize = 24, PlaceholderText = "Type your answer", Text = "", ClearTextOnFocus = false }, qFrame); corner(qInput, 10)
local qButton = mk("TextButton", { Size = UDim2.new(0, 150, 0, 46), Position = UDim2.new(1, -170, 0, 192), BackgroundColor3 = Color3.fromRGB(255, 190, 40), TextColor3 = Color3.fromRGB(43, 26, 0), Font = FONT, TextSize = 20, Text = "ANSWER" }, qFrame); corner(qButton, 10)
local qTimerBg = mk("Frame", { Size = UDim2.new(1, -40, 0, 8), Position = UDim2.new(0, 20, 0, 250), BackgroundColor3 = Color3.fromRGB(15, 24, 33), BorderSizePixel = 0 }, qFrame); corner(qTimerBg, 4)
local qTimer = mk("Frame", { Size = UDim2.new(1, 0, 1, 0), BackgroundColor3 = Color3.fromRGB(59, 157, 255), BorderSizePixel = 0 }, qTimerBg); corner(qTimer, 4)
local qResult = mk("TextLabel", { Size = UDim2.new(1, -40, 0, 60), Position = UDim2.new(0, 20, 0, 190), BackgroundColor3 = Color3.fromRGB(22, 61, 35), TextColor3 = Color3.new(1, 1, 1), Font = FONT, TextSize = 18, TextWrapped = true, Text = "", Visible = false }, qFrame); corner(qResult, 10)

local question: { kind: string, startedAt: number, timeLimit: number }? = nil
local resultHideAt = 0
local function hideQuestion() question = nil; qFrame.Visible = false; qInput:ReleaseFocus() end
local function showQuestion(data: any)
	question = { kind = data.kind, startedAt = os.clock(), timeLimit = data.timeLimit }
	local col = Config.RARITY[data.rarity or "common"].color
	local title = if data.kind == "reload" then "RELOAD: quick sum!" elseif data.kind == "respawn" then "SOLVE THIS TO RESPAWN" elseif data.kind == "gate" then "MATHS GATE: hard sum" else string.upper(Config.RARITY[data.rarity or "common"].label) .. " CHEST"
	qHeader.Text = title; qHeader.BackgroundColor3 = col:Lerp(DARK, 0.6); qHeader.TextColor3 = col
	qTopic.Text = data.topic or ""; qText.Text = data.text or ""; qHint.Text = if data.hint then "Hint: " .. data.hint else ""
	qInput.Text = ""; qInput.Visible = true; qButton.Visible = true; qResult.Visible = false; qTimerBg.Visible = true
	if data.kind == "reload" then qFrame.Position = UDim2.new(0.5, -280, 0, 50) else qFrame.Position = UDim2.new(0.5, -280, 0.5, -160) end
	qFrame.Visible = true
	task.defer(function() qInput:CaptureFocus(); task.wait(); qInput.Text = "" end)
end
local function submit()
	if not question then return end
	local text = qInput.Text
	if text:gsub("%s", "") == "" then return end
	qInput.Visible = false; qButton.Visible = false
	Answer:FireServer(text)
end
qButton.MouseButton1Click:Connect(submit)
qInput.FocusLost:Connect(function(enterPressed) if enterPressed then submit() end end)

local function onResult(data: any)
	if data.kind == "cancel" then hideQuestion(); return end
	question = nil
	qInput.Visible = false; qButton.Visible = false; qTimerBg.Visible = false; qResult.Visible = true
	if data.correct then
		qResult.BackgroundColor3 = Color3.fromRGB(22, 61, 35)
		local extra = ""
		if data.loot and #data.loot > 0 then extra = "\nYou got: " .. table.concat(data.loot, ", ") end
		if data.kind == "respawn" then extra = "\nRespawning…" elseif data.kind == "gate" then extra = "\nThe vault opens!" elseif data.kind == "reload" then extra = "\nMagazine full!" end
		qResult.Text = "✅ Correct!" .. extra
	else
		qResult.BackgroundColor3 = Color3.fromRGB(61, 22, 22)
		local why = if data.timeout then "⏰ Out of time!" else "❌ Not quite."
		local tail = if data.kind == "respawn" then "Another sum is coming…" elseif data.kind == "reload" then "Half a magazine after a 2 second wait." elseif data.kind == "gate" then "The gate stays shut." else "The chest stays locked."
		qResult.Text = why .. "  The answer was " .. tostring(data.answer) .. ".\n" .. tail
	end
	resultHideAt = os.clock() + (if data.correct then 1.6 else 2.8)
end
ShowQuestion.OnClientEvent:Connect(showQuestion)
Result.OnClientEvent:Connect(onResult)

-- ---------- notifications & feed ----------
local toastUntil = 0
local function showToast(text: string, color: Color3)
	if qFrame.Visible then return end
	toast.Text = text; toast.TextColor3 = color; toast.Visible = true; toastUntil = os.clock() + 2.5
end
local function addFeed(text: string, color: Color3)
	local l = mk("TextLabel", { Size = UDim2.new(1, 0, 0, 22), BackgroundColor3 = Color3.new(0, 0, 0), BackgroundTransparency = 0.5, TextColor3 = color, Font = FONT, TextSize = 14, Text = text, TextXAlignment = Enum.TextXAlignment.Left, LayoutOrder = math.floor(os.clock() * 10) }, feed); corner(l, 6)
	mk("UIPadding", { PaddingLeft = UDim.new(0, 8) }, l)
	Debris:AddItem(l, 7)
	local kids = feed:GetChildren(); local labels = {}
	for _, k in ipairs(kids) do if k:IsA("TextLabel") then table.insert(labels, k) end end
	table.sort(labels, function(a, b) return a.LayoutOrder < b.LayoutOrder end)
	while #labels > 5 do local old = table.remove(labels, 1); if old then old:Destroy() end end
end
Notify.OnClientEvent:Connect(function(text: string, color: Color3)
	if text == "hit" then crosshair.TextColor3 = Color3.fromRGB(255, 80, 80); task.delay(0.12, function() crosshair.TextColor3 = Color3.new(1, 1, 1) end); return end
	showToast(text, color); addFeed(text, color)
end)

-- ---------- tracers ----------
Tracer.OnClientEvent:Connect(function(from: Vector3, to: Vector3, color: Color3)
	local dist = (to - from).Magnitude
	local p = Instance.new("Part"); p.Anchored = true; p.CanCollide = false; p.CastShadow = false
	p.Material = Enum.Material.Neon; p.Color = color:Lerp(Color3.new(1, 1, 0.7), 0.5); p.Size = Vector3.new(0.12, 0.12, dist)
	p.CFrame = CFrame.lookAt(from, to) * CFrame.new(0, 0, -dist / 2); p.Parent = workspace
	Debris:AddItem(p, 0.07)
	local flash = Instance.new("Part"); flash.Anchored = true; flash.CanCollide = false; flash.Shape = Enum.PartType.Ball; flash.Material = Enum.Material.Neon; flash.Color = Color3.fromRGB(255, 220, 120); flash.Size = Vector3.new(1, 1, 1); flash.CFrame = CFrame.new(from); flash.Parent = workspace
	Debris:AddItem(flash, 0.05)
end)

-- ---------- shooting / items / building ----------
local firing = false
local function currentTool(): Tool?
	local c = player.Character; if not c then return nil end
	return c:FindFirstChildOfClass("Tool")
end
local function fireOnce()
	local tool = currentTool(); if not tool then return end
	if tool:GetAttribute("Weapon") then
		if (tool:GetAttribute("Ammo") or 0) <= 0 then Reload:FireServer(); return end
		Shoot:FireServer(mouse.Hit.Position)
	elseif tool:GetAttribute("Consumable") then
		UseItem:FireServer()
	end
end
UserInputService.InputBegan:Connect(function(input, processed)
	if input.UserInputType == Enum.UserInputType.MouseButton1 and not processed then
		firing = true; fireOnce()
	end
end)
UserInputService.InputEnded:Connect(function(input)
	if input.UserInputType == Enum.UserInputType.MouseButton1 then firing = false end
end)
ContextActionService:BindAction("MR_Reload", function(_, state) if state == Enum.UserInputState.Begin then Reload:FireServer() end end, true, Enum.KeyCode.R)
ContextActionService:SetTitle("MR_Reload", "Reload")
ContextActionService:BindAction("MR_Build", function(_, state)
	if state ~= Enum.UserInputState.Begin then return end
	local c = player.Character; local r = c and c:FindFirstChild("HumanoidRootPart") :: BasePart?
	if r then Build:FireServer(r.CFrame * CFrame.new(0, 2.5, -7)) end
end, true, Enum.KeyCode.F)
ContextActionService:SetTitle("MR_Build", "Wall")
-- touch: tapping with a tool activates it through the Tool's own Activated event (hook each tool once)
local hooked: { [Tool]: boolean } = {}
local function hookTool(tool: Tool)
	if hooked[tool] then return end
	hooked[tool] = true
	tool.Activated:Connect(function() if UserInputService.TouchEnabled and not UserInputService.MouseEnabled then fireOnce() end end)
end
local function hookCharacter(char: Model)
	char.ChildAdded:Connect(function(ch) if ch:IsA("Tool") then hookTool(ch) end end)
	for _, ch in ipairs(char:GetChildren()) do if ch:IsA("Tool") then hookTool(ch) end end
end
if player.Character then hookCharacter(player.Character) end
player.CharacterAdded:Connect(hookCharacter)
-- automatic weapons keep firing while the button is held
task.spawn(function()
	while true do
		local tool = currentTool()
		local rate = (tool and tool:GetAttribute("Rate")) or 0.2
		task.wait(math.max(0.05, rate))
		if firing and tool and tool:GetAttribute("Auto") and not question then fireOnce() end
	end
end)
-- empty gun: the server tells us, we pop the reload sum
Reload.OnClientEvent:Connect(function() if not question then showToast("Empty! Press R (or click) to reload with a quick sum", Color3.fromRGB(255, 211, 77)) end end)

-- ---------- per-frame HUD ----------
player.CameraMaxZoomDistance = 18
player.CameraMinZoomDistance = 6
RunService.RenderStepped:Connect(function()
	local now = os.clock()
	if question then
		local f = math.clamp(1 - (now - question.startedAt) / question.timeLimit, 0, 1)
		qTimer.Size = UDim2.new(f, 0, 1, 0); qTimer.BackgroundColor3 = if f < 0.3 then Color3.fromRGB(255, 107, 107) else Color3.fromRGB(59, 157, 255)
	elseif qFrame.Visible and now > resultHideAt then
		hideQuestion()
	end
	if toast.Visible and now > toastUntil then toast.Visible = false end
	local shield = player:GetAttribute("Shield") or 0
	shieldFill.Size = UDim2.new(shield / 100, 0, 1, 0); shieldText.Text = "SHIELD " .. shield
	bricksLabel.Text = "🧱 Bricks: " .. tostring(player:GetAttribute("Bricks") or 0)
	local m = UserInputService:GetMouseLocation(); crosshair.Position = UDim2.new(0, m.X - 15, 0, m.Y - 15)
	local tool = currentTool()
	if tool and tool:GetAttribute("Weapon") then
		ammoLabel.Text = tostring(tool:GetAttribute("Ammo") or 0) .. " / " .. tostring(tool:GetAttribute("Mag") or 0); ammoLabel.Visible = true; crosshair.Visible = true
	elseif tool and tool:GetAttribute("Consumable") then
		ammoLabel.Text = tool.Name .. " ×" .. tostring(tool:GetAttribute("Count") or 1) .. "  (click to use)"; ammoLabel.Visible = true; crosshair.Visible = false
	else
		ammoLabel.Visible = false; crosshair.Visible = false
	end
	info.Text = "🧠 Brain level " .. tostring(player:GetAttribute("BrainLevel") or 1) .. "   🔥 Streak " .. tostring(player:GetAttribute("Streak") or 0) .. "   ✅ " .. tostring(player:GetAttribute("SumsRight") or 0) .. " sums right"
end)
