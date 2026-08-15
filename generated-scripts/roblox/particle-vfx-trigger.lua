--[[
    ScripForge — Particle & VFX Trigger
    Pack: Roblox Pack | Category: Systems
    Version: 1.0.0

    Changelog:
      1.0.0 - Initial release

    Reusable ParticleEmitter/Trail trigger system that plays configurable hit and impact effects on demand.
]]

-- ============================================================
-- ParticleVFXTrigger.lua  (ModuleScript, place in ReplicatedStorage)
-- Call from server scripts to fire effects that replicate to all clients,
-- or from LocalScripts for purely cosmetic client-only effects.
-- ============================================================

local TweenService = game:GetService("TweenService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Debris = game:GetService("Debris")

local VFXTrigger = {}

-- Effect presets: each defines emitter properties applied to a temporary Attachment.
local EFFECT_PRESETS = {
	HitSpark = {
		Color = ColorSequence.new(Color3.fromRGB(255, 200, 80)),
		Lifetime = NumberRange.new(0.15, 0.3),
		Rate = 0,
		EmitCount = 20,
		Speed = NumberRange.new(8, 16),
		Size = NumberSequence.new(0.3),
		SpreadAngle = Vector2.new(180, 180),
	},
	BloodImpact = {
		Color = ColorSequence.new(Color3.fromRGB(150, 0, 0)),
		Lifetime = NumberRange.new(0.3, 0.6),
		Rate = 0,
		EmitCount = 12,
		Speed = NumberRange.new(4, 9),
		Size = NumberSequence.new(0.4),
		SpreadAngle = Vector2.new(90, 90),
	},
	MagicBurst = {
		Color = ColorSequence.new(Color3.fromRGB(120, 80, 255)),
		Lifetime = NumberRange.new(0.5, 1),
		Rate = 0,
		EmitCount = 30,
		Speed = NumberRange.new(5, 12),
		Size = NumberSequence.new(0.6),
		SpreadAngle = Vector2.new(360, 360),
	},
}

-- Builds a temporary ParticleEmitter under an Attachment at worldPosition, fires a single
-- burst using :Emit(), then cleans itself up automatically after its lifetime expires.
function VFXTrigger.PlayBurst(presetName, worldPosition, parentPart)
	local preset = EFFECT_PRESETS[presetName]
	if not preset then
		warn("[VFXTrigger] Unknown effect preset: " .. tostring(presetName))
		return
	end

	local attachment = Instance.new("Attachment")
	attachment.WorldPosition = worldPosition
	attachment.Parent = parentPart or workspace.Terrain

	local emitter = Instance.new("ParticleEmitter")
	emitter.Color = preset.Color
	emitter.Lifetime = preset.Lifetime
	emitter.Rate = preset.Rate
	emitter.Speed = preset.Speed
	emitter.Size = preset.Size
	emitter.SpreadAngle = preset.SpreadAngle
	emitter.Parent = attachment

	emitter:Emit(preset.EmitCount)

	-- Clean up after the longest possible particle lifetime plus a safety margin
	local maxLifetime = preset.Lifetime.Max
	Debris:AddItem(attachment, maxLifetime + 1)

	return attachment
end

-- Attaches a Trail effect between two attachments on a moving part (e.g. a weapon swing
-- or projectile) for a fixed duration, then removes it.
function VFXTrigger.PlayTrail(part, color, duration)
	if not part or not part:IsA("BasePart") then
		return
	end

	local attach0 = Instance.new("Attachment")
	attach0.Position = Vector3.new(0, part.Size.Y / 2, 0)
	attach0.Parent = part

	local attach1 = Instance.new("Attachment")
	attach1.Position = Vector3.new(0, -part.Size.Y / 2, 0)
	attach1.Parent = part

	local trail = Instance.new("Trail")
	trail.Attachment0 = attach0
	trail.Attachment1 = attach1
	trail.Color = ColorSequence.new(color or Color3.new(1, 1, 1))
	trail.Lifetime = 0.3
	trail.Parent = part

	task.delay(duration or 1, function()
		trail.Enabled = false
		Debris:AddItem(trail, trail.Lifetime + 0.1)
		Debris:AddItem(attach0, trail.Lifetime + 0.1)
		Debris:AddItem(attach1, trail.Lifetime + 0.1)
	end)

	return trail
end

-- Fades out and destroys a persistent looping emitter smoothly instead of an abrupt stop
function VFXTrigger.FadeOutEmitter(emitter, fadeTime)
	if not emitter then
		return
	end
	emitter.Enabled = false

	local originalTransparency = emitter.Transparency
	local tween = TweenService:Create(emitter, TweenInfo.new(fadeTime or 0.5), {
		Transparency = NumberSequence.new(1),
	})
	tween:Play()
	tween.Completed:Connect(function()
		emitter.Transparency = originalTransparency
		emitter:Destroy()
	end)
end

return VFXTrigger
