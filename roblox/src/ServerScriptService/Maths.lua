--!strict
-- Maths question generator and answer checker (Year 5/6, UK curriculum).
-- Tiers: 1 = easy (common chests) ... 4 = hardest (legendary chests).
local Maths = {}

local function rand(a: number, b: number): number return math.random(a, b) end
local function pick<T>(t: { T }): T return t[math.random(1, #t)] end
local function gcd(a: number, b: number): number
	a, b = math.abs(a), math.abs(b)
	while b ~= 0 do a, b = b, a % b end
	return a
end
local function round(x: number, dp: number?): number
	local m = 10 ^ (dp or 3)
	return math.floor(x * m + 0.5) / m
end
local function fracStr(n: number, d: number): string
	local g = gcd(n, d); if g == 0 then g = 1 end
	n, d = n / g, d / g
	if d == 1 then return tostring(n) end
	return n .. "/" .. d
end
local function toRoman(n: number): string
	local map: { { any } } = { { 100, "C" }, { 90, "XC" }, { 50, "L" }, { 40, "XL" }, { 10, "X" }, { 9, "IX" }, { 5, "V" }, { 4, "IV" }, { 1, "I" } }
	local s = ""
	for _, pair in ipairs(map) do
		while n >= pair[1] do s ..= pair[2]; n -= pair[1] end
	end
	return s
end
local function isPrime(n: number): boolean
	if n < 2 then return false end
	for i = 2, math.floor(math.sqrt(n)) do if n % i == 0 then return false end end
	return true
end
local function ordinal(k: number): string
	local suf = "th"
	if k % 10 == 1 and k ~= 11 then suf = "st" elseif k % 10 == 2 and k ~= 12 then suf = "nd" elseif k % 10 == 3 and k ~= 13 then suf = "rd" end
	return k .. suf
end
local function fmt(x: number): string
	if x == math.floor(x) then return tostring(math.floor(x)) end
	local s = string.format("%.4f", x)
	s = s:gsub("0+$", ""):gsub("%.$", "")
	return s
end
local function commas(n: number): string
	local s = tostring(math.floor(n))
	local out = s:reverse():gsub("(%d%d%d)", "%1,"):reverse()
	return (out:gsub("^,", ""))
end

export type Question = { topic: string, tier: number, text: string, kind: string, answer: any, display: string, hint: string? }
type Gen = (name: string) -> { text: string, kind: string, answer: any, display: string, hint: string? }
local TOPICS: { [number]: { { topic: string, fn: Gen } } } = { [1] = {}, [2] = {}, [3] = {}, [4] = {} }
local function def(tier: number, topic: string, fn: Gen) table.insert(TOPICS[tier], { topic = topic, fn = fn }) end
local function num(text: string, answer: number, display: string?, hint: string?)
	return { text = text, kind = "number", answer = answer, display = display or fmt(answer), hint = hint }
end

-- ---------------- TIER 1 ----------------
def(1, "Times tables", function() local a, b = rand(2, 12), rand(2, 12); return num(a .. " × " .. b .. " = ?", a * b) end)
def(1, "Division facts", function() local a, b = rand(2, 12), rand(2, 12); return num((a * b) .. " ÷ " .. a .. " = ?", b) end)
def(1, "Adding", function() local a, b = rand(25, 999), rand(25, 999); return num(a .. " + " .. b .. " = ?", a + b) end)
def(1, "Taking away", function() local a = rand(100, 999); local b = rand(10, a - 10); return num(a .. " − " .. b .. " = ?", a - b) end)
def(1, "Rounding", function()
	local to = pick({ 10, 100, 1000 }); local n = rand(if to == 1000 then 1001 else 101, 9999)
	return num("Round " .. n .. " to the nearest " .. to .. ".", math.floor(n / to + 0.5) * to)
end)
def(1, "Doubling and halving", function()
	if math.random() < 0.5 then local n = rand(13, 99); return num("What is double " .. n .. "?", n * 2) end
	local n = rand(10, 100) * 2; return num("What is half of " .. n .. "?", n / 2)
end)
def(1, "Number bonds", function()
	local total = pick({ 100, 100, 1000 }); local a = if total == 100 then rand(1, 99) else rand(50, 950)
	return num(a .. " + ? = " .. total, total - a)
end)
def(1, "Place value", function()
	local digits = rand(4, 5); local n, pos, digit
	repeat
		n = rand(10 ^ (digits - 1), 10 ^ digits - 1); pos = rand(0, digits - 1); digit = math.floor(n / 10 ^ pos) % 10
		local _, count = tostring(n):gsub(tostring(digit), "")
		if digit ~= 0 and count == 1 then break end
	until false
	return num("What is the value of the digit " .. digit .. " in " .. commas(n) .. "?", digit * 10 ^ pos, nil, "Think about which column the digit is in.")
end)
def(1, "Counting in steps", function()
	local step = pick({ 2, 5, 10, 25, 50, 100 }); local start = step * rand(1, 8)
	local terms = {}; for i = 0, 3 do table.insert(terms, tostring(start + step * i)) end
	return num("What comes next? " .. table.concat(terms, ", ") .. ", ?", start + step * 4)
end)

-- ---------------- TIER 2 ----------------
def(2, "Equivalent fractions", function()
	local d = rand(2, 6); local n = rand(1, d - 1); local k = rand(2, 6)
	return num(n .. "/" .. d .. " = ?/" .. (d * k) .. "   (what is the missing top number?)", n * k)
end)
def(2, "Fraction of an amount", function()
	local d = pick({ 2, 3, 4, 5, 6, 8, 10 }); local n = rand(1, d - 1); local amount = d * rand(2, 12)
	return num("What is " .. n .. "/" .. d .. " of " .. amount .. "?", n * amount / d, nil, "Divide by " .. d .. ", then multiply by " .. n .. ".")
end)
def(2, "Simplifying fractions", function()
	local n, d
	repeat d = rand(2, 9); n = rand(1, d - 1) until gcd(n, d) == 1
	local k = rand(2, 5)
	return { text = "Write " .. (n * k) .. "/" .. (d * k) .. " in its simplest form.", kind = "fraction-simplest", answer = n .. "/" .. d, display = n .. "/" .. d, hint = "Divide the top and bottom by the same number." }
end)
def(2, "Adding fractions", function()
	local d = rand(3, 12); local a = rand(1, d - 2); local b = rand(1, d - 1 - a)
	return { text = a .. "/" .. d .. " + " .. b .. "/" .. d .. " = ?   (answer as a fraction, e.g. 3/4)", kind = "fraction", answer = (a + b) / d, display = fracStr(a + b, d) }
end)
def(2, "Subtracting fractions", function()
	local d = rand(3, 12); local a = rand(2, d - 1); local b = rand(1, a - 1)
	return { text = a .. "/" .. d .. " − " .. b .. "/" .. d .. " = ?   (answer as a fraction, e.g. 3/4)", kind = "fraction", answer = (a - b) / d, display = fracStr(a - b, d) }
end)
local FD = { { 1, 2, 0.5 }, { 1, 4, 0.25 }, { 3, 4, 0.75 }, { 1, 5, 0.2 }, { 2, 5, 0.4 }, { 3, 5, 0.6 }, { 4, 5, 0.8 }, { 1, 10, 0.1 }, { 3, 10, 0.3 }, { 7, 10, 0.7 }, { 9, 10, 0.9 }, { 1, 8, 0.125 }, { 1, 100, 0.01 }, { 1, 20, 0.05 } }
def(2, "Fractions and decimals", function()
	local f = pick(FD); local n, d, dec = f[1], f[2], f[3]
	if math.random() < 0.5 then return { text = "Write " .. n .. "/" .. d .. " as a decimal.", kind = "decimal", answer = dec, display = fmt(dec) } end
	return { text = "Write " .. fmt(dec) .. " as a fraction.", kind = "fraction", answer = dec, display = n .. "/" .. d }
end)
def(2, "Fractions and percentages", function()
	local f = pick(FD); local n, d, dec = f[1], f[2], f[3]
	if math.random() < 0.5 then return { text = "Write " .. n .. "/" .. d .. " as a percentage.", kind = "percent", answer = round(dec * 100), display = fmt(round(dec * 100)) .. "%" } end
	return { text = "Write " .. fmt(round(dec * 100)) .. "% as a fraction.", kind = "fraction", answer = dec, display = n .. "/" .. d }
end)
def(2, "Negative numbers", function()
	local r = math.random()
	if r < 0.4 then local t, drop = -rand(1, 9), rand(2, 9); return num("The temperature is " .. t .. "°C. It drops by " .. drop .. "°C. What is the new temperature?", t - drop, (t - drop) .. "°C") end
	if r < 0.7 then local t, rise = -rand(2, 12), rand(3, 20); return num("The temperature is " .. t .. "°C. It rises by " .. rise .. "°C. What is it now?", t + rise, (t + rise) .. "°C") end
	local a = rand(1, 9); local b = rand(a + 1, 19); return num(a .. " − " .. b .. " = ?", a - b)
end)
def(2, "Roman numerals", function()
	local n = rand(4, 99)
	if math.random() < 0.5 then return num("What number is " .. toRoman(n) .. " in Roman numerals?", n) end
	return { text = "Write " .. n .. " in Roman numerals.", kind = "exact", answer = toRoman(n), display = toRoman(n) }
end)
def(2, "Measures", function()
	local r = rand(1, 5)
	if r == 1 then local cm = rand(2, 9) * 100 + pick({ 0, 50, 25, 75 }); return num("How many metres is " .. cm .. " cm?", cm / 100, fmt(cm / 100) .. " m") end
	if r == 2 then local kg = rand(1, 9) + pick({ 0, 0.5, 0.25 }); return num("How many grams are in " .. fmt(kg) .. " kg?", kg * 1000, fmt(kg * 1000) .. " g") end
	if r == 3 then local h = rand(2, 6); return num("How many minutes are in " .. h .. " hours?", h * 60) end
	if r == 4 then local m = rand(1, 9) + pick({ 0.2, 0.5, 0.75 }); return num("How many centimetres is " .. fmt(m) .. " m?", round(m * 100), fmt(round(m * 100)) .. " cm") end
	local l = rand(1, 5) + pick({ 0.5, 0.25, 0 }); return num("How many millilitres are in " .. fmt(l) .. " litres?", l * 1000, fmt(l * 1000) .. " ml")
end)
def(2, "Multiplying and dividing by 10, 100, 1000", function()
	local by = pick({ 10, 100, 1000 })
	if math.random() < 0.5 then local n = rand(2, 99) + pick({ 0, 0, 0.5, 0.2, 0.7 }); return num(fmt(n) .. " × " .. by .. " = ?", round(n * by)) end
	local n = rand(2, 99) * pick({ 1, 10, 100 }); return num(n .. " ÷ " .. by .. " = ?", round(n / by, 4))
end)
def(2, "Perimeter", function()
	local w, h = rand(3, 20), rand(2, 15)
	return num("A rectangle is " .. w .. " cm long and " .. h .. " cm wide. What is its perimeter in cm?", 2 * (w + h), nil, "Add all four sides.")
end)
def(2, "Big adding and subtracting", function()
	local a, b = rand(1000, 9999), rand(1000, 9999)
	if math.random() < 0.5 then return num(a .. " + " .. b .. " = ?", a + b) end
	local big, small = math.max(a, b), math.min(a, b); return num(big .. " − " .. small .. " = ?", big - small)
end)
def(2, "Decimals", function()
	local a, b = rand(10, 99) / 10, rand(10, 99) / 10
	if math.random() < 0.5 then return num(fmt(a) .. " + " .. fmt(b) .. " = ?", round(a + b)) end
	local big, small = math.max(a, b), math.min(a, b); return num(fmt(big) .. " − " .. fmt(small) .. " = ?", round(big - small))
end)

-- ---------------- TIER 3 ----------------
def(3, "Percentages of amounts", function()
	local pm = pick({ { 10, 10 }, { 20, 5 }, { 25, 4 }, { 50, 2 }, { 75, 4 }, { 5, 20 } }); local p, mult = pm[1], pm[2]
	local amount = mult * rand(2, 15)
	return num("What is " .. p .. "% of " .. amount .. "?", p * amount / 100, nil, "10% means divide by 10.")
end)
def(3, "Area", function()
	if math.random() < 0.6 then local w, h = rand(3, 15), rand(2, 12); return num("A rectangle is " .. w .. " cm long and " .. h .. " cm wide. What is its area in cm²?", w * h) end
	local b, h = rand(2, 12) * 2, rand(2, 12); return num("A triangle has a base of " .. b .. " cm and a height of " .. h .. " cm. What is its area in cm²?", b * h / 2, nil, "Area of a triangle = base × height ÷ 2.")
end)
def(3, "Angles", function()
	local r = rand(1, 4)
	if r == 1 then local a = rand(20, 160); return num("Two angles make a straight line. One is " .. a .. "°. What is the other?", 180 - a) end
	if r == 2 then local a = rand(20, 100); local b = rand(20, 150 - a); return num("A triangle has angles of " .. a .. "° and " .. b .. "°. What is the third angle?", 180 - a - b, nil, "Angles in a triangle add up to 180°.") end
	if r == 3 then local a = rand(40, 200); local b = rand(40, 300 - a); return num("Three angles meet at a point. Two of them are " .. a .. "° and " .. b .. "°. What is the third?", 360 - a - b, nil, "Angles around a point add up to 360°.") end
	local a = rand(10, 80); return num("A right angle is split into two. One part is " .. a .. "°. What is the other part?", 90 - a)
end)
def(3, "Division with remainders", function()
	local a = rand(3, 9); local q = rand(10, 99); local r = rand(1, a - 1)
	return { text = (a * q + r) .. " ÷ " .. a .. " = ?   (write it like 12 r 3)", kind = "remainder", answer = { q = q, r = r }, display = q .. " r " .. r }
end)
def(3, "Mixed numbers", function()
	local d = rand(2, 6); local whole = rand(1, 4); local part
	repeat part = rand(1, d - 1) until gcd(part, d) == 1
	local n = whole * d + part
	if math.random() < 0.5 then return { text = "Write " .. n .. "/" .. d .. " as a mixed number (like 1 3/4).", kind = "mixed", answer = { whole = whole, n = part, d = d }, display = whole .. " " .. part .. "/" .. d } end
	return { text = "Write " .. whole .. " " .. part .. "/" .. d .. " as an improper fraction (top-heavy).", kind = "fraction-simplest", answer = n .. "/" .. d, display = n .. "/" .. d }
end)
def(3, "Adding fractions (different bottoms)", function()
	local d1 = pick({ 2, 3, 4, 5, 6 }); local k = if d1 <= 4 then rand(2, 3) else 2; local d2 = d1 * k
	local a, b = rand(1, d1 - 1), rand(1, d2 - 1); local n = a * k + b
	return { text = a .. "/" .. d1 .. " + " .. b .. "/" .. d2 .. " = ?   (answer as a fraction)", kind = "fraction", answer = n / d2, display = fracStr(n, d2), hint = "Change " .. a .. "/" .. d1 .. " into " .. (k * a) .. "/" .. d2 .. " first." }
end)
def(3, "Multiplying bigger numbers", function()
	if math.random() < 0.5 then local a, b = rand(12, 99), rand(3, 9); return num(a .. " × " .. b .. " = ?", a * b) end
	local a, b = rand(100, 999), rand(3, 9); return num(a .. " × " .. b .. " = ?", a * b)
end)
def(3, "Comparing fractions", function()
	local a, b, c, d
	repeat b = rand(2, 9); a = rand(1, b - 1); d = rand(2, 9); c = rand(1, d - 1) until a * d ~= c * b and b ~= d
	local bigger = if a / b > c / d then a .. "/" .. b else c .. "/" .. d
	return { text = "Which fraction is bigger: " .. a .. "/" .. b .. " or " .. c .. "/" .. d .. "?", kind = "exact", answer = bigger, display = bigger, hint = "Try giving them the same bottom number." }
end)
def(3, "Square numbers", function()
	local n = rand(2, 12)
	if math.random() < 0.5 then return num("What is " .. n .. " squared (" .. n .. "²)?", n * n) end
	return num("Which number multiplied by itself makes " .. (n * n) .. "?", n)
end)
def(3, "Primes, factors and multiples", function()
	local r = rand(1, 4)
	if r == 1 then local n = rand(2, 50); local a = if isPrime(n) then "yes" else "no"; return { text = "Is " .. n .. " a prime number? (yes or no)", kind = "exact", answer = a, display = a } end
	if r == 2 then local n, k = rand(3, 12), rand(3, 9); return num("What is the " .. ordinal(k) .. " multiple of " .. n .. "?", n * k) end
	if r == 3 then local g = pick({ 2, 3, 4, 5, 6 }); local a = g * rand(2, 5); local b; repeat b = g * rand(2, 6) until b ~= a; return num("What is the highest common factor of " .. a .. " and " .. b .. "?", gcd(a, b)) end
	local a = pick({ 2, 3, 4, 5, 6 }); local b; repeat b = pick({ 3, 4, 5, 6, 8 }) until b ~= a; return num("What is the lowest common multiple of " .. a .. " and " .. b .. "?", a * b / gcd(a, b))
end)
def(3, "Number sequences", function()
	local step = pick({ 3, 4, 6, 7, 8, 9, 11, 12, -3, -5, -7 }); local start = if step > 0 then rand(1, 30) else rand(20, 50)
	local terms = {}; for i = 0, 3 do table.insert(terms, tostring(start + step * i)) end
	return num("What comes next? " .. table.concat(terms, ", ") .. ", ?", start + step * 4)
end)
def(3, "Time", function()
	local h1, m1 = rand(1, 10), pick({ 0, 15, 30, 45 }); local mins = rand(2, 9) * 15
	local total = h1 * 60 + m1 + mins; local h2, m2 = math.floor(total / 60), total % 60
	return num(string.format("A film starts at %d:%02d and finishes at %d:%02d. How many minutes long is it?", h1, m1, h2, m2), mins)
end)
def(3, "Rounding decimals", function()
	local n = rand(100, 999) / 100
	if math.random() < 0.5 then return num("Round " .. fmt(n) .. " to the nearest whole number.", math.floor(n + 0.5)) end
	return num("Round " .. fmt(n) .. " to one decimal place.", math.floor(n * 10 + 0.5) / 10)
end)

-- ---------------- TIER 4 ----------------
def(4, "Long multiplication", function() local a, b = rand(12, 99), rand(12, 99); return num(a .. " × " .. b .. " = ?", a * b) end)
def(4, "Long division", function()
	local b, q = rand(11, 25), rand(12, 60)
	if math.random() < 0.6 then return num((b * q) .. " ÷ " .. b .. " = ?", q) end
	local r = rand(1, b - 1); return { text = (b * q + r) .. " ÷ " .. b .. " = ?   (write it like 12 r 3)", kind = "remainder", answer = { q = q, r = r }, display = q .. " r " .. r }
end)
def(4, "Order of operations (BIDMAS)", function()
	local a, b, c = rand(2, 9), rand(2, 9), rand(2, 9); local t = rand(1, 6)
	if t == 1 then return num(a .. " + " .. b .. " × " .. c .. " = ?", a + b * c, nil, "Multiply before you add.") end
	if t == 2 then return num("(" .. a .. " + " .. b .. ") × " .. c .. " = ?", (a + b) * c, nil, "Brackets first.") end
	if t == 3 then local cc = math.min(c, a * b - 1); return num(a .. " × " .. b .. " − " .. cc .. " = ?", a * b - cc) end
	if t == 4 then return num((a * b) .. " ÷ " .. a .. " + " .. c .. " = ?", b + c, nil, "Divide before you add.") end
	if t == 5 then return num(a .. "² + " .. b .. " = ?", a * a + b) end
	local big = b * c + rand(2, 20); return num(big .. " − " .. b .. " × " .. c .. " = ?", big - b * c, nil, "Multiply before you subtract.")
end)
def(4, "Multiplying fractions", function()
	local r = rand(1, 3)
	if r == 1 then local d = rand(2, 6); local n = rand(1, d - 1); local w = d * rand(2, 6); return num(n .. "/" .. d .. " × " .. w .. " = ?", n * w / d) end
	if r == 2 then local d1 = rand(2, 5); local n1 = rand(1, d1 - 1); local d2 = rand(2, 5); local n2 = rand(1, d2 - 1); return { text = n1 .. "/" .. d1 .. " × " .. n2 .. "/" .. d2 .. " = ?   (answer as a fraction)", kind = "fraction", answer = (n1 * n2) / (d1 * d2), display = fracStr(n1 * n2, d1 * d2), hint = "Multiply the tops, multiply the bottoms." } end
	local d, w = rand(2, 5), rand(2, 5); return { text = "1/" .. d .. " ÷ " .. w .. " = ?   (answer as a fraction)", kind = "fraction", answer = 1 / (d * w), display = "1/" .. (d * w) }
end)
def(4, "Trickier percentages", function()
	local p = pick({ 15, 30, 35, 40, 45, 60, 70, 80, 90 }); local amount = 20 * rand(2, 20)
	return num("What is " .. p .. "% of " .. amount .. "?", p * amount / 100, nil, "Find 10% first, then build it up.")
end)
def(4, "Ratio", function()
	local a, b
	repeat a = rand(1, 5); b = rand(1, 6) until a ~= b
	local k = rand(2, 8); local total = (a + b) * k
	return num("Sweets are shared in the ratio " .. a .. ":" .. b .. ". There are " .. total .. " sweets altogether. How many does the first person get?", a * k, nil, "There are " .. (a + b) .. " parts in total.")
end)
def(4, "Algebra", function()
	local m, n, c = rand(2, 6), rand(2, 12), rand(1, 15)
	if math.random() < 0.5 then return num(m .. "n + " .. c .. " = " .. (m * n + c) .. ".   What is n?", n) end
	return num(m .. "y − " .. c .. " = " .. (m * n - c) .. ".   What is y?", n)
end)
def(4, "Mean (average)", function()
	local mean = rand(4, 20); local count = rand(3, 5); local nums, last
	repeat
		nums = {}; local sum = 0
		for _ = 1, count - 1 do local v = rand(math.max(1, mean - 5), mean + 5); table.insert(nums, tostring(v)); sum += v end
		last = mean * count - sum
	until last >= 1 and last <= mean + 8
	table.insert(nums, tostring(last))
	return num("What is the mean of " .. table.concat(nums, ", ") .. "?", mean, nil, "Add them up, then divide by how many there are.")
end)
def(4, "Decimal multiplying and dividing", function()
	if math.random() < 0.5 then local a, b = rand(2, 19) / 10, rand(2, 9); return num(fmt(a) .. " × " .. b .. " = ?", round(a * b)) end
	local b, q = rand(2, 9), rand(2, 19) / 10; return num(fmt(round(q * b)) .. " ÷ " .. b .. " = ?", q)
end)
def(4, "Angles in shapes", function()
	if math.random() < 0.5 then local a, b = rand(50, 120), rand(50, 120); local c = rand(40, 300 - a - b); return num("A four-sided shape has angles of " .. a .. "°, " .. b .. "° and " .. c .. "°. What is the fourth angle?", 360 - a - b - c, nil, "Angles in a quadrilateral add up to 360°.") end
	local top = rand(10, 80) * 2; return num("An isosceles triangle has a top angle of " .. top .. "°. What size is each of the other two (equal) angles?", (180 - top) / 2)
end)
def(4, "Shape puzzles", function()
	if math.random() < 0.5 then local s = rand(3, 12); return num("A square has a perimeter of " .. (s * 4) .. " cm. What is its area in cm²?", s * s) end
	local b, h = rand(3, 12), rand(2, 10); return num("A parallelogram has a base of " .. b .. " cm and a height of " .. h .. " cm. What is its area in cm²?", b * h)
end)
def(4, "Money problems", function(name)
	local price = rand(1, 5) + pick({ 0.5, 0.25, 0.75, 0.99 }); local qty = rand(2, 4); local pay = pick({ 10, 20, 20, 50 })
	local cost = round(price * qty, 2)
	if cost > pay then return num(name .. " buys " .. qty .. " comics at £" .. string.format("%.2f", price) .. " each. How much do they cost altogether?", cost, "£" .. string.format("%.2f", cost)) end
	return num(name .. " has £" .. pay .. " and buys " .. qty .. " comics at £" .. string.format("%.2f", price) .. " each. How much change is there?", round(pay - cost, 2), "£" .. string.format("%.2f", pay - cost))
end)

-- ---------------- public API ----------------
function Maths.generate(tier: number, name: string?, avoidTopic: string?, preferTopics: { string }?): Question
	tier = math.clamp(math.floor(tier), 1, 4)
	local list = TOPICS[tier]
	if avoidTopic and #list > 1 then
		local filtered = {}
		for _, t in ipairs(list) do if t.topic ~= avoidTopic then table.insert(filtered, t) end end
		list = filtered
	end
	local weak = {}
	if preferTopics then for _, t in ipairs(list) do if table.find(preferTopics, t.topic) then table.insert(weak, t) end end end
	local t = if #weak > 0 and math.random() < 0.4 then pick(weak) else pick(list)
	local q = t.fn(name or "Charlie")
	return { topic = t.topic, tier = tier, text = q.text, kind = q.kind, answer = q.answer, display = q.display, hint = q.hint }
end

local UNIT_PATTERNS = { "£", "%$", "%%", "°c", "°", "degrees", "cm²", "cm2", "cm", "mm", "km", "kg", "ml", "minutes", "mins", "min", "hours", "hour", "litres", "litre", "grams", "gram", "metres", "metre", "%f[%a]m%f[%A]", "%f[%a]g%f[%A]", "%f[%a]l%f[%A]", "%f[%a]p%f[%A]" }
local function trim(s: string): string return (s:gsub("^%s+", ""):gsub("%s+$", "")) end
function Maths.parseNumeric(input: string): number?
	local s = trim(input:lower()):gsub("−", "-"):gsub(",", "")
	for _, p in ipairs(UNIT_PATTERNS) do s = s:gsub(p, "") end
	s = trim(s)
	local sign, w, n, d = s:match("^(%-?)(%d+)%s+(%d+)%s*/%s*(%d+)$")
	if w then
		if tonumber(d) == 0 then return nil end
		local v = tonumber(w) :: number + tonumber(n) :: number / tonumber(d) :: number
		return if sign == "-" then -v else v
	end
	local fn, fd = s:match("^(%-?%d+)%s*/%s*(%-?%d+)$")
	if fn then
		if tonumber(fd) == 0 then return nil end
		return tonumber(fn) :: number / tonumber(fd) :: number
	end
	if s:match("^%-?%d*%.?%d+$") then return tonumber(s) end
	return nil
end
local function norm(s: string): string
	s = s:lower():gsub("[%s!%.]+", "")
	if s == "y" then return "yes" elseif s == "n" then return "no" end
	return s
end
local function close(v: number, ans: number): boolean
	return math.abs(v - ans) <= math.min(0.0011, math.max(1e-9, math.abs(ans) * 0.002))
end

function Maths.check(q: Question, input: string?): boolean
	if input == nil then return false end
	local s = trim(input)
	if s == "" then return false end
	local kind = q.kind
	if kind == "number" then
		local v = Maths.parseNumeric(s); if v == nil then return false end
		if close(v, q.answer) then return true end
		return s:find("%%") ~= nil and close(v / 100, q.answer)
	elseif kind == "decimal" then
		local compact = s:gsub("%s+", "")
		if not (compact:match("^%-?%d*%.%d+$") or compact:match("^%-?%d+$")) then return false end
		local v = Maths.parseNumeric(s); return v ~= nil and close(v, q.answer)
	elseif kind == "fraction" then
		local n, d = s:gsub("%s+", ""):match("^(%-?%d+)/(%d+)$")
		if not n then
			-- a whole-number answer may be written as a plain number
			if q.answer == math.floor(q.answer) and s:match("^%-?%d+$") then return tonumber(s) == q.answer end
			return false
		end
		if tonumber(d) == 0 then return false end
		return close(tonumber(n) :: number / tonumber(d) :: number, q.answer)
	elseif kind == "percent" then
		if s:find("/") then return false end
		local v = Maths.parseNumeric(s); return v ~= nil and close(v, q.answer)
	elseif kind == "fraction-simplest" then
		local an, ad = q.answer:match("^(%-?%d+)/(%d+)$"); an, ad = tonumber(an) :: number, tonumber(ad) :: number
		local n, d = s:gsub("%s+", ""):match("^(%-?%d+)/(%d+)$")
		if not n then local v = Maths.parseNumeric(s); return ad == 1 and v ~= nil and v == an end
		local nn, dd = tonumber(n) :: number, tonumber(d) :: number
		if dd == 0 then return false end
		return gcd(nn, dd) == 1 and nn * ad == an * dd
	elseif kind == "mixed" then
		local w, n, d = s:match("^(%-?%d+)%s+(%d+)%s*/%s*(%d+)$")
		if not w then return false end
		local ww, nn, dd = tonumber(w) :: number, tonumber(n) :: number, tonumber(d) :: number
		if dd == 0 then return false end
		return ww == q.answer.whole and nn * q.answer.d == q.answer.n * dd and gcd(nn, dd) == 1
	elseif kind == "remainder" then
		local qq, rr = s:lower():match("^(%d+)%s*r%a*%.?%s*(%d+)$")
		if not qq then return false end
		return tonumber(qq) == q.answer.q and tonumber(rr) == q.answer.r
	elseif kind == "exact" then
		return norm(s) == norm(q.answer)
	end
	return false
end

function Maths.topicCount(tier: number): number return #TOPICS[tier] end
return Maths
