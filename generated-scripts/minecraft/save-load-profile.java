/*
 * ScriptForge — World Save & Chunk Persistence
 * Pack: Minecraft Pack | Category: Systems
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Manages per-world named save slots with chunk-scoped persistence of block state and container contents.
 *
 * Bukkit/Spigot/Paper plugin module — drop into your plugin's source tree.
 */

package com.scriptforge.minecraft.systems;

import org.bukkit.Bukkit;
import org.bukkit.Chunk;
import org.bukkit.World;
import org.bukkit.block.BlockState;
import org.bukkit.block.Container;
import org.bukkit.configuration.file.YamlConfiguration;
import org.bukkit.inventory.ItemStack;
import org.bukkit.plugin.java.JavaPlugin;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

/**
 * SaveLoadProfile persists the state of a world's loaded chunks (block data
 * plus container inventories) into a named save slot on disk, and can
 * restore that slot later. Slots are stored as YAML files under
 * plugins/&lt;PluginName&gt;/saves/&lt;world&gt;/&lt;slotName&gt;.yml.
 */
public class SaveLoadProfile extends JavaPlugin {

    private File savesRoot;

    @Override
    public void onEnable() {
        savesRoot = new File(getDataFolder(), "saves");
        if (!savesRoot.exists()) {
            savesRoot.mkdirs();
        }
        getLogger().info("SaveLoadProfile enabled. Save root: " + savesRoot.getAbsolutePath());
    }

    /** Saves every currently loaded chunk of the given world into the named slot. */
    public boolean saveSlot(World world, String slotName) {
        File worldDir = new File(savesRoot, world.getName());
        if (!worldDir.exists()) worldDir.mkdirs();

        YamlConfiguration config = new YamlConfiguration();
        int chunkIndex = 0;
        for (Chunk chunk : world.getLoadedChunks()) {
            String chunkKey = "chunks." + chunkIndex;
            config.set(chunkKey + ".x", chunk.getX());
            config.set(chunkKey + ".z", chunk.getZ());
            saveContainersInChunk(chunk, config, chunkKey);
            chunkIndex++;
        }

        config.set("meta.chunkCount", chunkIndex);
        config.set("meta.savedAtMillis", System.currentTimeMillis());
        File targetFile = new File(worldDir, slotName + ".yml");
        try {
            config.save(targetFile);
            getLogger().info("Saved slot '" + slotName + "' for world '" + world.getName() + "' (" + chunkIndex + " chunks).");
            return true;
        } catch (IOException e) {
            getLogger().severe("Failed to save slot '" + slotName + "': " + e.getMessage());
            return false;
        }
    }

    /** Serializes every container's inventory found in the chunk into the config under the chunk key. */
    private void saveContainersInChunk(Chunk chunk, YamlConfiguration config, String chunkKey) {
        List<String> containerEntries = new ArrayList<>();
        for (BlockState state : chunk.getTileEntities()) {
            if (!(state instanceof Container)) continue;
            Container container = (Container) state;
            String path = chunkKey + ".containers." + containerEntries.size();
            config.set(path + ".x", state.getX());
            config.set(path + ".y", state.getY());
            config.set(path + ".z", state.getZ());
            config.set(path + ".items", container.getInventory().getContents());
            containerEntries.add(path); // track count only
        }
    }

    /** Loads a previously saved slot, restoring container contents for chunks currently loaded. */
    public boolean loadSlot(World world, String slotName) {
        File file = new File(new File(savesRoot, world.getName()), slotName + ".yml");
        if (!file.exists()) {
            getLogger().warning("Save slot not found: " + file.getAbsolutePath());
            return false;
        }

        YamlConfiguration config = YamlConfiguration.loadConfiguration(file);
        int chunkCount = config.getInt("meta.chunkCount", 0);
        for (int i = 0; i < chunkCount; i++) {
            String chunkKey = "chunks." + i;
            int cx = config.getInt(chunkKey + ".x");
            int cz = config.getInt(chunkKey + ".z");
            Chunk chunk = world.getChunkAt(cx, cz);
            if (!chunk.isLoaded()) chunk.load();
            restoreContainers(world, config, chunkKey);
        }

        getLogger().info("Loaded slot '" + slotName + "' for world '" + world.getName() + "' (" + chunkCount + " chunks).");
        return true;
    }

    /** Restores container inventories from saved data back into the live world blocks. */
    @SuppressWarnings("unchecked")
    private void restoreContainers(World world, YamlConfiguration config, String chunkKey) {
        if (!config.contains(chunkKey + ".containers")) return;

        for (String key : config.getConfigurationSection(chunkKey + ".containers").getKeys(false)) {
            String path = chunkKey + ".containers." + key;
            int x = config.getInt(path + ".x");
            int y = config.getInt(path + ".y");
            int z = config.getInt(path + ".z");

            BlockState state = world.getBlockAt(x, y, z).getState();
            if (!(state instanceof Container)) continue;
            List<ItemStack> items = (List<ItemStack>) config.getList(path + ".items");
            Container container = (Container) state;
            container.getInventory().clear();
            if (items != null) {
                for (int slot = 0; slot < items.size(); slot++) {
                    container.getInventory().setItem(slot, items.get(slot));
                }
            }
            state.update(true, false);
        }
    }

    /** Lists all save slot names available for a given world. */
    public List<String> listSlots(World world) {
        List<String> names = new ArrayList<>();
        File worldDir = new File(savesRoot, world.getName());
        File[] files = worldDir.listFiles((dir, name) -> name.endsWith(".yml"));
        if (files == null) return names;
        for (File f : files) {
            names.add(f.getName().replace(".yml", ""));
        }
        return names;
    }
}
