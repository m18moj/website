/*
 * ScriptForge — Land Claim & Protection System
 * Pack: Minecraft Pack | Category: Systems
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Chunk-based land claiming that blocks build/break actions from non-members inside claimed chunks.
 *
 * Bukkit/Spigot/Paper plugin module — drop into your plugin's source tree.
 */

package com.scriptforge.minecraft.systems;

import org.bukkit.Chunk;
import org.bukkit.World;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.block.BlockBreakEvent;
import org.bukkit.event.block.BlockPlaceEvent;
import org.bukkit.plugin.java.JavaPlugin;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * LandClaimProtectionSystem allows players to claim whole chunks. Only the
 * claim owner and explicitly trusted members may break or place blocks
 * inside a claimed chunk; everyone else is blocked and notified.
 */
public class LandClaimProtectionSystem extends JavaPlugin implements Listener {

    /** Uniquely identifies a chunk by world name + coordinates so it works across worlds. */
    private static class ChunkKey {
        final String world;
        final int x;
        final int z;

        ChunkKey(String world, int x, int z) {
            this.world = world;
            this.x = x;
            this.z = z;
        }

        @Override
        public boolean equals(Object o) {
            if (!(o instanceof ChunkKey)) return false;
            ChunkKey other = (ChunkKey) o;
            return x == other.x && z == other.z && world.equals(other.world);
        }

        @Override
        public int hashCode() {
            return world.hashCode() * 31 * 31 + x * 31 + z;
        }
    }

    /** A claimed chunk: its owner plus any trusted members who may also build there. */
    private static class Claim {
        final UUID owner;
        final Set<UUID> trusted = new HashSet<>();

        Claim(UUID owner) {
            this.owner = owner;
        }
    }

    private final Map<ChunkKey, Claim> claims = new HashMap<>();

    @Override
    public void onEnable() {
        getServer().getPluginManager().registerEvents(this, this);
        getLogger().info("LandClaimProtectionSystem enabled with " + claims.size() + " claim(s) loaded.");
    }

    private ChunkKey keyFor(Chunk chunk) {
        return new ChunkKey(chunk.getWorld().getName(), chunk.getX(), chunk.getZ());
    }

    /** Claims the chunk the player is standing in. Fails if already claimed by someone else. */
    public boolean claimChunk(Player player) {
        Chunk chunk = player.getLocation().getChunk();
        ChunkKey key = keyFor(chunk);
        if (claims.containsKey(key)) {
            player.sendMessage("This chunk is already claimed.");
            return false;
        }
        claims.put(key, new Claim(player.getUniqueId()));
        player.sendMessage("Claimed chunk [" + chunk.getX() + ", " + chunk.getZ() + "].");
        return true;
    }

    /** Releases a claim owned by the given player. */
    public boolean unclaimChunk(Player player) {
        Chunk chunk = player.getLocation().getChunk();
        ChunkKey key = keyFor(chunk);
        Claim claim = claims.get(key);
        if (claim == null || !claim.owner.equals(player.getUniqueId())) {
            player.sendMessage("You don't own a claim here.");
            return false;
        }
        claims.remove(key);
        player.sendMessage("Claim released.");
        return true;
    }

    /** Adds a trusted member who may build/break in the owner's current claim. */
    public boolean trustPlayer(Player owner, UUID trustedId) {
        Claim claim = claims.get(keyFor(owner.getLocation().getChunk()));
        if (claim == null || !claim.owner.equals(owner.getUniqueId())) return false;
        claim.trusted.add(trustedId);
        return true;
    }

    private boolean canModify(Player player, Chunk chunk) {
        Claim claim = claims.get(keyFor(chunk));
        if (claim == null) return true; // unclaimed land, no restriction
        return claim.owner.equals(player.getUniqueId()) || claim.trusted.contains(player.getUniqueId());
    }

    @EventHandler
    public void onBlockBreak(BlockBreakEvent event) {
        if (!canModify(event.getPlayer(), event.getBlock().getChunk())) {
            event.setCancelled(true);
            event.getPlayer().sendMessage("This land is claimed — you can't break blocks here.");
        }
    }

    @EventHandler
    public void onBlockPlace(BlockPlaceEvent event) {
        if (!canModify(event.getPlayer(), event.getBlock().getChunk())) {
            event.setCancelled(true);
            event.getPlayer().sendMessage("This land is claimed — you can't build here.");
        }
    }
}
