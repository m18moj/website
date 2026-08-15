/*
 * ScripForge — PvP Arena & Kit System
 * Pack: Minecraft Pack | Category: Combat
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Arena queueing that pairs waiting players and equips them with a chosen preset combat kit on match start.
 *
 * Bukkit/Spigot/Paper plugin module — drop into your plugin's source tree.
 */

package com.scripforge.minecraft.combat;

import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.PlayerDeathEvent;
import org.bukkit.inventory.ItemStack;
import org.bukkit.plugin.java.JavaPlugin;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * PvpArenaKitSystem maintains a matchmaking queue for a single arena and
 * spawns pairs of queued players there equipped with one of a few preset
 * combat kits (Warrior, Archer, Tank). The loser is teleported out and the
 * winner remains; both have their kits cleared on match end.
 */
public class PvpArenaKitSystem extends JavaPlugin implements Listener {

    /** A named loadout: armor + weapon + consumables applied on match start. */
    public static class Kit {
        final String name;
        final ItemStack[] items;

        Kit(String name, ItemStack... items) {
            this.name = name;
            this.items = items;
        }
    }

    private final Map<String, Kit> kits = new HashMap<>();
    private final Deque<Player> queue = new ArrayDeque<>();
    private final Map<UUID, Location> preMatchLocations = new HashMap<>();
    private Location arenaSpawnA;
    private Location arenaSpawnB;

    @Override
    public void onEnable() {
        getServer().getPluginManager().registerEvents(this, this);
        registerDefaultKits();
        getLogger().info("PvpArenaKitSystem enabled with " + kits.size() + " kit(s).");
    }

    private void registerDefaultKits() {
        kits.put("warrior", new Kit("Warrior",
                new ItemStack(Material.IRON_SWORD), new ItemStack(Material.IRON_CHESTPLATE),
                new ItemStack(Material.IRON_LEGGINGS), new ItemStack(Material.SHIELD)));
        kits.put("archer", new Kit("Archer",
                new ItemStack(Material.BOW), new ItemStack(Material.ARROW, 32),
                new ItemStack(Material.LEATHER_CHESTPLATE)));
        kits.put("tank", new Kit("Tank",
                new ItemStack(Material.STONE_SWORD), new ItemStack(Material.IRON_HELMET),
                new ItemStack(Material.IRON_CHESTPLATE), new ItemStack(Material.IRON_BOOTS)));
    }

    /** Configures the two spawn points used for the arena's two combatants. */
    public void setArenaSpawns(Location spawnA, Location spawnB) {
        this.arenaSpawnA = spawnA;
        this.arenaSpawnB = spawnB;
    }

    /** Adds a player to the queue; automatically starts a match once two are waiting. */
    public void joinQueue(Player player, String kitName) {
        if (!kits.containsKey(kitName.toLowerCase())) {
            player.sendMessage("Unknown kit: " + kitName);
            return;
        }
        queue.add(player);
        preMatchLocations.put(player.getUniqueId(), player.getLocation());
        player.sendMessage("Queued for PvP arena with kit: " + kitName);
        player.setMetadata("sf_kit", new org.bukkit.metadata.FixedMetadataValue(this, kitName.toLowerCase()));

        if (queue.size() >= 2) {
            startMatch(queue.poll(), queue.poll());
        }
    }

    /** Equips both queued players with their chosen kits and teleports them into the arena. */
    private void startMatch(Player a, Player b) {
        if (arenaSpawnA == null || arenaSpawnB == null) {
            a.sendMessage("Arena not configured yet.");
            b.sendMessage("Arena not configured yet.");
            return;
        }

        equipKit(a, getQueuedKit(a));
        equipKit(b, getQueuedKit(b));
        a.teleport(arenaSpawnA);
        b.teleport(arenaSpawnB);
        a.sendMessage("Match starting against " + b.getName() + "!");
        b.sendMessage("Match starting against " + a.getName() + "!");
    }

    private String getQueuedKit(Player player) {
        if (player.hasMetadata("sf_kit")) {
            return player.getMetadata("sf_kit").get(0).asString();
        }
        return "warrior";
    }

    /** Clears armor/inventory and applies the named kit's items to a player. */
    private void equipKit(Player player, String kitName) {
        Kit kit = kits.get(kitName);
        if (kit == null) return;

        player.getInventory().clear();
        player.getInventory().setArmorContents(null);
        for (ItemStack item : kit.items) {
            player.getInventory().addItem(item.clone());
        }
        player.setHealth(player.getAttribute(org.bukkit.attribute.Attribute.GENERIC_MAX_HEALTH).getValue());
    }

    /** On death in the arena, clears the loser's kit and returns them to their pre-match location. */
    @EventHandler
    public void onPlayerDeath(PlayerDeathEvent event) {
        Player player = event.getEntity();
        Location returnLocation = preMatchLocations.remove(player.getUniqueId());
        if (returnLocation == null) return; // wasn't in an arena match

        player.getInventory().clear();
        player.getInventory().setArmorContents(null);
        player.spigot().respawn();
        player.teleport(returnLocation);
        player.sendMessage("You were eliminated. Returned to your original location.");
    }
}
