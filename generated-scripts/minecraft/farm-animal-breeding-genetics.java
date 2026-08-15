/*
 * ScripForge — Farm Animal Breeding & Genetics
 * Pack: Minecraft Pack | Category: Gameplay
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Breeding cooldowns, offspring trait inheritance, and a simple genetics/mutation chance system.
 *
 * Bukkit/Spigot/Paper plugin module — drop into your plugin's source tree.
 */

package com.scripforge.minecraft.gameplay;

import org.bukkit.attribute.Attribute;
import org.bukkit.entity.Animals;
import org.bukkit.entity.LivingEntity;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.EntityBreedEvent;
import org.bukkit.plugin.java.JavaPlugin;

import java.util.HashMap;
import java.util.Map;
import java.util.Random;
import java.util.UUID;

/**
 * FarmAnimalBreedingGenetics layers a lightweight genetics system on top of
 * vanilla animal breeding. Each tracked animal carries a "genome" of simple
 * numeric traits (size, speed, yield). Offspring inherit an average of their
 * parents' traits with a small random mutation chance, and breeding attempts
 * are gated by a per-animal cooldown independent of vanilla's own timer.
 */
public class FarmAnimalBreedingGenetics extends JavaPlugin implements Listener {

    /** A simple set of heritable traits, each expressed as a 0.0-2.0 multiplier. */
    private static class Genome {
        double size;
        double speed;
        double yield;

        Genome(double size, double speed, double yield) {
            this.size = size;
            this.speed = speed;
            this.yield = yield;
        }

        static Genome random(Random random) {
            return new Genome(
                    0.8 + random.nextDouble() * 0.4,
                    0.8 + random.nextDouble() * 0.4,
                    0.8 + random.nextDouble() * 0.4
            );
        }
    }

    private static final double MUTATION_CHANCE = 0.12;
    private static final double MUTATION_STRENGTH = 0.25;
    private static final long BREED_COOLDOWN_MILLIS = 5L * 60L * 1000L; // 5 minutes

    private final Map<UUID, Genome> genomes = new HashMap<>();
    private final Map<UUID, Long> lastBredTime = new HashMap<>();
    private final Random random = new Random();

    @Override
    public void onEnable() {
        getServer().getPluginManager().registerEvents(this, this);
        getLogger().info("FarmAnimalBreedingGenetics enabled, tracking " + genomes.size() + " genome(s).");
    }

    /** Registers a new animal with a randomly rolled starting genome, e.g. on spawn. */
    public void registerAnimal(Animals animal) {
        genomes.putIfAbsent(animal.getUniqueId(), Genome.random(random));
    }

    /** Returns true if the given animal is off cooldown and free to breed again. */
    public boolean canBreed(Animals animal) {
        Long last = lastBredTime.get(animal.getUniqueId());
        if (last == null) return true;
        return System.currentTimeMillis() - last >= BREED_COOLDOWN_MILLIS;
    }

    /** Reacts to vanilla breeding: applies cooldown, blocks over-eager pairs, and rolls genetics. */
    @EventHandler
    public void onBreed(EntityBreedEvent event) {
        if (!(event.getMother() instanceof Animals) || !(event.getFather() instanceof Animals)) return;

        Animals mother = (Animals) event.getMother();
        Animals father = (Animals) event.getFather();

        if (!canBreed(mother) || !canBreed(father)) {
            event.setCancelled(true);
            return;
        }

        lastBredTime.put(mother.getUniqueId(), System.currentTimeMillis());
        lastBredTime.put(father.getUniqueId(), System.currentTimeMillis());

        Genome motherGenome = genomes.computeIfAbsent(mother.getUniqueId(), id -> Genome.random(random));
        Genome fatherGenome = genomes.computeIfAbsent(father.getUniqueId(), id -> Genome.random(random));
        Genome childGenome = inherit(motherGenome, fatherGenome);

        if (event.getEntity() instanceof Animals) {
            Animals child = (Animals) event.getEntity();
            genomes.put(child.getUniqueId(), childGenome);
            applyGenomeToEntity(child, childGenome);
        }
    }

    /** Averages two parent genomes and rolls a chance of mutation on each trait. */
    private Genome inherit(Genome mother, Genome father) {
        Genome child = new Genome(
                average(mother.size, father.size),
                average(mother.speed, father.speed),
                average(mother.yield, father.yield)
        );

        child.size = maybeMutate(child.size);
        child.speed = maybeMutate(child.speed);
        child.yield = maybeMutate(child.yield);
        return child;
    }

    private double average(double a, double b) {
        return (a + b) / 2.0;
    }

    /** Applies a random mutation shift with a small chance, clamped to a sane trait range. */
    private double maybeMutate(double trait) {
        if (random.nextDouble() >= MUTATION_CHANCE) return trait;
        double shift = (random.nextDouble() * 2 - 1) * MUTATION_STRENGTH;
        return clamp(trait + shift, 0.5, 2.0);
    }

    private double clamp(double value, double min, double max) {
        return Math.max(min, Math.min(max, value));
    }

    /** Translates genome traits onto observable entity behavior — size, movement speed. */
    private void applyGenomeToEntity(LivingEntity entity, Genome genome) {
        if (entity.getAttribute(Attribute.GENERIC_MOVEMENT_SPEED) != null) {
            double base = entity.getAttribute(Attribute.GENERIC_MOVEMENT_SPEED).getBaseValue();
            entity.getAttribute(Attribute.GENERIC_MOVEMENT_SPEED).setBaseValue(base * genome.speed);
        }
        if (entity.getAttribute(Attribute.GENERIC_MAX_HEALTH) != null) {
            double base = entity.getAttribute(Attribute.GENERIC_MAX_HEALTH).getBaseValue();
            entity.getAttribute(Attribute.GENERIC_MAX_HEALTH).setBaseValue(base * genome.size);
        }
    }

    /** Returns the yield trait for a tracked animal, used by harvesting/milking/shearing hooks. */
    public double getYieldMultiplier(Animals animal) {
        Genome genome = genomes.get(animal.getUniqueId());
        return genome != null ? genome.yield : 1.0;
    }

    /** Clears tracking data for an animal that has died or been removed. */
    public void untrackAnimal(UUID animalId) {
        genomes.remove(animalId);
        lastBredTime.remove(animalId);
    }
}
