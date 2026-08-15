/*
 * ScripForge — Redstone Circuit & Logic Gate System
 * Pack: Minecraft Pack | Category: Systems
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Custom logic-gate component evaluation for redstone-style circuits with signal propagation delay.
 *
 * Bukkit/Spigot/Paper plugin module — drop into your plugin's source tree.
 */

package com.scripforge.minecraft.systems;

import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.block.Block;
import org.bukkit.block.data.Levelled;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.block.BlockRedstoneEvent;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.scheduler.BukkitRunnable;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * RedstoneCircuitLogicGateSystem lets designers place named logic-gate
 * components (AND, OR, XOR, NOT) at fixed block locations. Each gate reads
 * the current signal state of its configured inputs, evaluates its truth
 * table, and schedules its output to flip after a fixed propagation delay —
 * mimicking real redstone tick lag instead of resolving instantly.
 */
public class RedstoneCircuitLogicGateSystem extends JavaPlugin implements Listener {

    /** Supported gate types and their evaluation rules. */
    public enum GateType {
        AND, OR, XOR, NOT
    }

    /** A single logic gate: its inputs, its output block, and its type. */
    private static class Gate {
        final GateType type;
        final List<Location> inputs = new ArrayList<>();
        final Location output;
        boolean lastOutput = false;

        Gate(GateType type, Location output) {
            this.type = type;
            this.output = output;
        }
    }

    private static final long PROPAGATION_DELAY_TICKS = 2L; // ~0.1s per gate hop
    private static final int MAX_SIGNAL = 15;

    /** Gates keyed by an ID string chosen by whoever wires the circuit. */
    private final Map<String, Gate> gates = new HashMap<>();

    /** Tracks pending evaluation tasks so re-triggers don't stack duplicate runnables. */
    private final Map<String, Boolean> pendingEvaluation = new HashMap<>();

    /** Manual signal overrides for input locations not backed by real redstone dust. */
    private final Map<Location, Integer> manualSignals = new HashMap<>();

    @Override
    public void onEnable() {
        getServer().getPluginManager().registerEvents(this, this);
        getLogger().info("RedstoneCircuitLogicGateSystem enabled with " + gates.size() + " gate(s) registered.");
    }

    /** Registers a new logic gate with the given inputs and output location. */
    public void registerGate(String id, GateType type, Location output, Location... inputLocations) {
        Gate gate = new Gate(type, output);
        for (Location loc : inputLocations) {
            gate.inputs.add(loc);
        }
        gates.put(id, gate);
    }

    /** Removes a previously registered gate by its ID. */
    public boolean unregisterGate(String id) {
        return gates.remove(id) != null;
    }

    /** Sets a manual input signal strength (0-15) for locations not wired to vanilla redstone. */
    public void setManualSignal(Location loc, int strength) {
        manualSignals.put(loc, Math.max(0, Math.min(MAX_SIGNAL, strength)));
        for (String id : gates.keySet()) {
            scheduleEvaluation(id);
        }
    }

    /** Reads the effective signal strength at a location, preferring manual overrides. */
    private int readSignal(Location loc) {
        Integer manual = manualSignals.get(loc);
        if (manual != null) return manual;

        Block block = loc.getBlock();
        if (block.getBlockData() instanceof Levelled) {
            return ((Levelled) block.getBlockData()).getLevel();
        }
        return block.isBlockPowered() || block.isBlockIndirectlyPowered() ? MAX_SIGNAL : 0;
    }

    /** Evaluates a gate's truth table from its current input signals. */
    private boolean evaluate(Gate gate) {
        List<Boolean> inputStates = new ArrayList<>();
        for (Location loc : gate.inputs) {
            inputStates.add(readSignal(loc) > 0);
        }

        switch (gate.type) {
            case AND:
                for (boolean b : inputStates) if (!b) return false;
                return !inputStates.isEmpty();
            case OR:
                for (boolean b : inputStates) if (b) return true;
                return false;
            case XOR:
                int highCount = 0;
                for (boolean b : inputStates) if (b) highCount++;
                return highCount % 2 == 1;
            case NOT:
                return inputStates.isEmpty() || !inputStates.get(0);
            default:
                return false;
        }
    }

    /** Schedules a delayed re-evaluation of the named gate, coalescing repeat triggers. */
    private void scheduleEvaluation(String id) {
        if (Boolean.TRUE.equals(pendingEvaluation.get(id))) return;
        pendingEvaluation.put(id, true);

        new BukkitRunnable() {
            @Override
            public void run() {
                pendingEvaluation.put(id, false);
                applyOutput(id);
            }
        }.runTaskLater(this, PROPAGATION_DELAY_TICKS);
    }

    /** Computes and writes a gate's output signal to its output block. */
    private void applyOutput(String id) {
        Gate gate = gates.get(id);
        if (gate == null) return;

        boolean result = evaluate(gate);
        if (result == gate.lastOutput) return;
        gate.lastOutput = result;

        Block outBlock = gate.output.getBlock();
        if (outBlock.getBlockData() instanceof Levelled) {
            Levelled data = (Levelled) outBlock.getBlockData();
            data.setLevel(result ? MAX_SIGNAL : 0);
            outBlock.setBlockData(data);
        } else {
            outBlock.setType(result ? Material.REDSTONE_BLOCK : Material.AIR);
        }

        // Downstream gates that read this gate's output need re-evaluating too.
        for (Map.Entry<String, Gate> entry : gates.entrySet()) {
            if (entry.getValue().inputs.contains(gate.output)) {
                scheduleEvaluation(entry.getKey());
            }
        }
    }

    /** Any redstone change near a tracked input re-triggers the owning gate(s). */
    @EventHandler
    public void onRedstoneChange(BlockRedstoneEvent event) {
        Location changed = event.getBlock().getLocation();
        for (Map.Entry<String, Gate> entry : gates.entrySet()) {
            if (entry.getValue().inputs.contains(changed)) {
                scheduleEvaluation(entry.getKey());
            }
        }
    }

    /** Returns the last computed output state of a gate, or false if unknown. */
    public boolean getOutputState(String id) {
        Gate gate = gates.get(id);
        return gate != null && gate.lastOutput;
    }
}
