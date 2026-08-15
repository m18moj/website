/*
 * ScripForge — Nether Portal & Dimension Travel
 * Pack: Minecraft Pack | Category: World
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Portal linking, coordinate scaling between dimensions, and a travel cooldown/particle transition.
 *
 * Bukkit/Spigot/Paper plugin module — drop into your plugin's source tree.
 */

package com.scripforge.minecraft.world;

import org.bukkit.Location;
import org.bukkit.Particle;
import org.bukkit.Sound;
import org.bukkit.World;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerMoveEvent;
import org.bukkit.plugin.java.JavaPlugin;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * NetherPortalDimensionTravel manages a set of custom linked portal pairs
 * between an "overworld" style dimension and a "nether" style dimension,
 * scaling coordinates by a fixed ratio when crossing, and gating repeat
 * travel with a short per-player cooldown plus a particle/sound transition.
 */
public class NetherPortalDimensionTravel extends JavaPlugin implements Listener {

    /** How much overworld coordinates shrink when stepping into the nether-scaled world. */
    private static final double COORD_SCALE = 8.0;

    /** Minimum seconds a player must wait between consecutive portal uses. */
    private static final long COOLDOWN_MILLIS = 4000L;

    /** Radius (blocks) within which a player is considered "at" a portal. */
    private static final double PORTAL_TRIGGER_RADIUS = 1.25;

    /** A portal frame's anchor location paired with the anchor it links to. */
    private static class PortalLink {
        final Location from;
        final Location to;

        PortalLink(Location from, Location to) {
            this.from = from;
            this.to = to;
        }
    }

    private final Map<String, PortalLink> portalLinks = new HashMap<>();
    private final Map<UUID, Long> lastTravelTime = new HashMap<>();

    @Override
    public void onEnable() {
        getServer().getPluginManager().registerEvents(this, this);
        getLogger().info("NetherPortalDimensionTravel enabled with " + portalLinks.size() + " link(s) registered.");
    }

    /** Links two portal anchor points bidirectionally under a shared circuit ID. */
    public void linkPortals(String circuitId, Location overworldAnchor, Location netherAnchor) {
        portalLinks.put(circuitId + ":forward", new PortalLink(overworldAnchor, netherAnchor));
        portalLinks.put(circuitId + ":back", new PortalLink(netherAnchor, overworldAnchor));
    }

    /** Removes both directions of a linked portal circuit. */
    public void unlinkPortals(String circuitId) {
        portalLinks.remove(circuitId + ":forward");
        portalLinks.remove(circuitId + ":back");
    }

    /** Converts a location from one dimension's coordinate space into the other's. */
    public Location scaleCoordinates(Location source, World targetWorld, boolean shrinking) {
        double factor = shrinking ? (1.0 / COORD_SCALE) : COORD_SCALE;
        double x = source.getX() * factor;
        double z = source.getZ() * factor;
        return new Location(targetWorld, x, source.getY(), z, source.getYaw(), source.getPitch());
    }

    /** Checks player movement each tick for proximity to any registered portal anchor. */
    @EventHandler
    public void onPlayerMove(PlayerMoveEvent event) {
        if (event.getTo() == null) return;
        Player player = event.getPlayer();

        for (PortalLink link : portalLinks.values()) {
            if (!link.from.getWorld().equals(player.getWorld())) continue;
            if (link.from.distanceSquared(player.getLocation()) <= PORTAL_TRIGGER_RADIUS * PORTAL_TRIGGER_RADIUS) {
                attemptTravel(player, link);
                return;
            }
        }
    }

    /** Teleports the player through a portal link if their cooldown has elapsed. */
    private void attemptTravel(Player player, PortalLink link) {
        UUID id = player.getUniqueId();
        long now = System.currentTimeMillis();
        Long last = lastTravelTime.get(id);
        if (last != null && now - last < COOLDOWN_MILLIS) {
            return;
        }
        lastTravelTime.put(id, now);

        playDepartureEffect(player.getLocation());
        player.teleport(link.to.clone().add(0.5, 0.5, 0.5));
        playArrivalEffect(link.to);
        player.playSound(link.to, Sound.BLOCK_PORTAL_TRAVEL, 1.0f, 1.0f);
    }

    /** Spawns a swirl of portal particles at the departure point. */
    private void playDepartureEffect(Location loc) {
        if (loc.getWorld() == null) return;
        loc.getWorld().spawnParticle(Particle.PORTAL, loc.clone().add(0, 1, 0), 40, 0.4, 0.6, 0.4, 0.15);
    }

    /** Spawns a burst of portal particles at the arrival point. */
    private void playArrivalEffect(Location loc) {
        if (loc.getWorld() == null) return;
        loc.getWorld().spawnParticle(Particle.REVERSE_PORTAL, loc.clone().add(0, 1, 0), 50, 0.4, 0.6, 0.4, 0.1);
    }

    /** Returns the remaining cooldown in milliseconds for a player, or 0 if ready to travel. */
    public long getRemainingCooldown(Player player) {
        Long last = lastTravelTime.get(player.getUniqueId());
        if (last == null) return 0L;
        long elapsed = System.currentTimeMillis() - last;
        return Math.max(0L, COOLDOWN_MILLIS - elapsed);
    }
}
