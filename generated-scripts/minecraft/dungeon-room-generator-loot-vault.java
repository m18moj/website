/*
 * ScripForge — Dungeon Room Generator & Loot Vault
 * Pack: Minecraft Pack | Category: World
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Procedurally stitches dungeon rooms from a room pool, ending in a locked vault gated by a boss key.
 *
 * Bukkit/Spigot/Paper plugin module — drop into your plugin's source tree.
 */

package com.scripforge.minecraft.world;

import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.World;
import org.bukkit.block.Block;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerInteractEvent;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;
import org.bukkit.plugin.java.JavaPlugin;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;

/**
 * DungeonRoomGeneratorLootVault chains a sequence of fixed-size room shells
 * end-to-end along a single corridor axis, picking each room shape from a
 * pool at random, and caps the run with a sealed vault room whose iron door
 * only opens for players holding a tagged boss key item.
 */
public class DungeonRoomGeneratorLootVault extends JavaPlugin implements Listener {

    /** One buildable room shape: interior size and the wall material used for its shell. */
    private static class RoomTemplate {
        final int width;
        final int length;
        final int height;
        final Material wallMaterial;
        final Material floorMaterial;

        RoomTemplate(int width, int length, int height, Material wallMaterial, Material floorMaterial) {
            this.width = width;
            this.length = length;
            this.height = height;
            this.wallMaterial = wallMaterial;
            this.floorMaterial = floorMaterial;
        }
    }

    private static final String VAULT_KEY_TAG = "§8[DungeonVaultKey]";
    private final List<RoomTemplate> roomPool = new ArrayList<>();
    private final List<Location> knownVaultDoors = new ArrayList<>();
    private final Random random = new Random();

    @Override
    public void onEnable() {
        getServer().getPluginManager().registerEvents(this, this);
        seedRoomPool();
        getLogger().info("DungeonRoomGeneratorLootVault enabled with " + roomPool.size() + " room templates.");
    }

    private void seedRoomPool() {
        roomPool.add(new RoomTemplate(7, 7, 4, Material.COBBLESTONE, Material.STONE_BRICKS));
        roomPool.add(new RoomTemplate(5, 9, 4, Material.MOSSY_COBBLESTONE, Material.CRACKED_STONE_BRICKS));
        roomPool.add(new RoomTemplate(9, 5, 5, Material.DEEPSLATE_BRICKS, Material.DEEPSLATE_TILES));
    }

    /**
     * Carves and builds a chain of dungeon rooms starting at {@code origin},
     * running along the +X axis, and finishes by sealing a locked vault at
     * the end of the chain.
     */
    public void generateDungeon(Location origin, int roomCount) {
        World world = origin.getWorld();
        int cursorX = origin.getBlockX();
        int baseY = origin.getBlockY();
        int z = origin.getBlockZ();

        for (int i = 0; i < roomCount; i++) {
            RoomTemplate template = roomPool.get(random.nextInt(roomPool.size()));
            buildRoomShell(world, cursorX, baseY, z, template);
            carveDoorway(world, cursorX + template.width, baseY, z + template.length / 2);
            cursorX += template.width + 1;
        }

        RoomTemplate vaultShape = new RoomTemplate(6, 6, 4, Material.POLISHED_BLACKSTONE_BRICKS, Material.GOLD_BLOCK);
        buildRoomShell(world, cursorX, baseY, z, vaultShape);
        Location doorLocation = new Location(world, cursorX, baseY + 1, z + vaultShape.length / 2);
        world.getBlockAt(doorLocation).setType(Material.IRON_DOOR);
        knownVaultDoors.add(doorLocation);
        getLogger().info("Vault sealed at " + doorLocation);
    }

    private void buildRoomShell(World world, int startX, int startY, int startZ, RoomTemplate template) {
        for (int x = 0; x < template.width; x++) {
            for (int z = 0; z < template.length; z++) {
                world.getBlockAt(startX + x, startY, startZ + z).setType(template.floorMaterial);
                world.getBlockAt(startX + x, startY + template.height, startZ + z).setType(template.wallMaterial);
            }
        }
        for (int y = 1; y < template.height; y++) {
            for (int x = 0; x < template.width; x++) {
                world.getBlockAt(startX + x, startY + y, startZ).setType(template.wallMaterial);
                world.getBlockAt(startX + x, startY + y, startZ + template.length - 1).setType(template.wallMaterial);
            }
            for (int z = 0; z < template.length; z++) {
                world.getBlockAt(startX, startY + y, startZ + z).setType(template.wallMaterial);
                world.getBlockAt(startX + template.width - 1, startY + y, startZ + z).setType(template.wallMaterial);
            }
        }
    }

    private void carveDoorway(World world, int x, int baseY, int z) {
        world.getBlockAt(x, baseY + 1, z).setType(Material.AIR);
        world.getBlockAt(x, baseY + 2, z).setType(Material.AIR);
    }

    /** Creates a boss key item that this dungeon's vault doors recognize. */
    public ItemStack createBossKey() {
        ItemStack key = new ItemStack(Material.TRIPWIRE_HOOK);
        ItemMeta meta = key.getItemMeta();
        meta.setDisplayName("§6Overlord's Vault Key");
        meta.setLore(List.of(VAULT_KEY_TAG));
        key.setItemMeta(meta);
        return key;
    }

    private boolean isBossKey(ItemStack item) {
        return item != null && item.hasItemMeta() && item.getItemMeta().hasLore()
                && item.getItemMeta().getLore().contains(VAULT_KEY_TAG);
    }

    @EventHandler
    public void onVaultDoorInteract(PlayerInteractEvent event) {
        Block clicked = event.getClickedBlock();
        if (clicked == null || clicked.getType() != Material.IRON_DOOR) return;
        if (!knownVaultDoors.contains(clicked.getLocation()) && !isTrackedNearby(clicked.getLocation())) return;

        Player player = event.getPlayer();
        ItemStack hand = player.getInventory().getItemInMainHand();
        if (!isBossKey(hand)) {
            event.setCancelled(true);
            player.sendMessage("§cThis vault is sealed. You need the boss key.");
        } else {
            player.sendMessage("§aThe vault door creaks open.");
        }
    }

    private boolean isTrackedNearby(Location loc) {
        for (Location known : knownVaultDoors) {
            if (known.getWorld().equals(loc.getWorld()) && known.distanceSquared(loc) <= 4) return true;
        }
        return false;
    }
}
