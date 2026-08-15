--[[
    ScripForge — VehicleSeat & Drivable Vehicle
    Pack: Roblox Pack | Category: Systems
    Version: 1.0.0

    Changelog:
      1.0.0 - Initial release

    VehicleSeat-based drivable car controller handling throttle, steering, and wheel-aligned motor torque.
]]

-- ============================================================
-- VehicleSeatDrivableVehicle.lua  (Script, place inside the vehicle Model)
-- Expects: Model contains a VehicleSeat and one or more wheel Parts tagged
-- via attributes: IsFrontWheel (bool), and each wheel has a HingeConstraint
-- or attached to a WeldConstraint chassis mount for a simple drift-friendly setup.
-- ============================================================

local RunService = game:GetService("RunService")

local vehicleModel = script.Parent
local vehicleSeat = vehicleModel:FindFirstChildWhichIsA("VehicleSeat", true)

if not vehicleSeat then
	warn("[Vehicle] No VehicleSeat found in " .. vehicleModel.Name .. " — script will not run.")
	return
end

-- Tunable vehicle parameters
local MAX_SPEED = 80          -- studs/sec, matches VehicleSeat.MaxSpeed for clarity
local TORQUE = 15000
local MAX_STEER_ANGLE = 35    -- degrees, applied to front-wheel HingeConstraints
local STEER_RESPONSE_SPEED = 6

vehicleSeat.MaxSpeed = MAX_SPEED
vehicleSeat.Torque = TORQUE
vehicleSeat.TurnSpeed = 20

-- Collects front-wheel hinge constraints for steering (tagged with attribute IsFrontWheel = true)
local frontWheelHinges = {}
for _, descendant in ipairs(vehicleModel:GetDescendants()) do
	if descendant:IsA("HingeConstraint") and descendant.Parent and descendant.Parent:GetAttribute("IsFrontWheel") then
		table.insert(frontWheelHinges, descendant)
	end
end

local currentSteerAngle = 0

-- Smoothly interpolates the current steering angle toward the target based on input
local function updateSteering(deltaTime)
	local steerInput = vehicleSeat.SteerFloat -- -1 (left) to 1 (right)
	local targetAngle = -steerInput * MAX_STEER_ANGLE

	currentSteerAngle += (targetAngle - currentSteerAngle) * math.clamp(STEER_RESPONSE_SPEED * deltaTime, 0, 1)

	for _, hinge in ipairs(frontWheelHinges) do
		hinge.TargetAngle = currentSteerAngle
	end
end

-- Applies a light auto-braking effect when no throttle input is given, to prevent endless rolling
local function updateThrottleAssist()
	local throttleInput = vehicleSeat.ThrottleFloat
	if throttleInput == 0 and vehicleSeat.Occupant then
		-- Gentle engine braking; VehicleSeat handles wheel torque natively via its
		-- built-in AutoRotate/Throttle-based motor behavior, this just adds resistance.
		vehicleSeat.Velocity = vehicleSeat.Velocity * 0.995
	end
end

-- Toggle headlights (any Light instances tagged with attribute IsHeadlight) based on occupancy
local headlightParts = {}
for _, descendant in ipairs(vehicleModel:GetDescendants()) do
	if descendant:GetAttribute("IsHeadlight") then
		table.insert(headlightParts, descendant)
	end
end

local function setHeadlights(on)
	for _, part in ipairs(headlightParts) do
		local light = part:FindFirstChildWhichIsA("PointLight") or part:FindFirstChildWhichIsA("SpotLight")
		if light then
			light.Enabled = on
		end
	end
end

vehicleSeat:GetPropertyChangedSignal("Occupant"):Connect(function()
	setHeadlights(vehicleSeat.Occupant ~= nil)
end)

-- Main per-frame update loop for steering/throttle assist while a driver is seated
local heartbeatConnection = RunService.Heartbeat:Connect(function(deltaTime)
	if not vehicleSeat.Occupant then
		return
	end
	updateSteering(deltaTime)
	updateThrottleAssist()
end)

vehicleModel.AncestryChanged:Connect(function(_, parent)
	if not parent then
		heartbeatConnection:Disconnect()
	end
end)

print("[Vehicle] Drivable vehicle controller initialized for " .. vehicleModel.Name)
