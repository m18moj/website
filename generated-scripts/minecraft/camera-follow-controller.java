/*
 * ScriptForge — Third-Person Camera Rig
 * Pack: Minecraft Pack | Category: Camera
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Simulates a smooth third-person follow camera using a spectator-mode rig entity, with collision avoidance and shoulder-swap.
 *
 * Bukkit/Spigot/Paper plugin module — drop into your plugin's source tree.
 */

package com.scriptforge.minecraft.camera;

import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.entity.ArmorStand;
import org.bukkit.entity.EntityType;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerToggleSneakEvent;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.scheduler.BukkitTask;
import org.bukkit.util.RayTraceResult;
import org.bukkit.util.Vector;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * CameraFollowController implements a third-person "over-the-shoulder" camera
 * by spawning an invisible marker armor stand behind the player and setting
 * the player to spectate it. The rig position lerps toward the ideal offset
 * each tick (smoothing), raycasts against terrain to avoid clipping through
 * walls, and can swap shoulders via sneak-toggle.
 */
public class CameraFollowController extends JavaPlugin implements Listener {

    private static final double CAMERA_DISTANCE = 4.5;
    private static final double SHOULDER_OFFSET = 1.2;
    private static final double HEIGHT_OFFSET = 1.6;
    /** Smoothing factor per tick; lower = smoother/slower catch-up. */
    private static final double LERP_FACTOR = 0.25;

    private final Map<UUID, ArmorStand> cameraRigs = new HashMap<>();
    private final Map<UUID, Boolean> shoulderRightSide = new HashMap<>();
    private final Map<UUID, Location> smoothedPosition = new HashMap<>();
    private BukkitTask followTask;

    @Override
    public void onEnable() {
        getServer().getPluginManager().registerEvents(this, this);
        followTask = Bukkit.getScheduler().runTaskTimer(this, this::updateAllRigs, 1L, 1L);
        getLogger().info("CameraFollowController enabled.");
    }

    @Override
    public void onDisable() {
        if (followTask != null) followTask.cancel();
        cameraRigs.values().forEach(ArmorStand::remove);
        cameraRigs.clear();
    }

    /** Enables the third-person rig for a player and starts spectating it. */
    public void enableThirdPerson(Player player) {
        Location spawnAt = player.getLocation();
        ArmorStand rig = player.getWorld().spawn(spawnAt, ArmorStand.class, stand -> {
            stand.setInvisible(true);
            stand.setMarker(true);
            stand.setGravity(false);
            stand.setInvulnerable(true);
            stand.setPersistent(false);
        });

        cameraRigs.put(player.getUniqueId(), rig);
        shoulderRightSide.putIfAbsent(player.getUniqueId(), true);
        smoothedPosition.put(player.getUniqueId(), spawnAt);
        player.setSpectatorTarget(rig);
    }

    /** Restores normal first-person view and removes the rig entity. */
    public void disableThirdPerson(Player player) {
        ArmorStand rig = cameraRigs.remove(player.getUniqueId());
        if (rig != null) {
            player.setSpectatorTarget(null);
            rig.remove();
        }
        smoothedPosition.remove(player.getUniqueId());
    }

    @EventHandler
    public void onSneakToggle(PlayerToggleSneakEvent event) {
        // Double-tap sneak while a rig is active swaps shoulder side.
        UUID id = event.getPlayer().getUniqueId();
        if (!cameraRigs.containsKey(id) || !event.isSneaking()) return;
        shoulderRightSide.put(id, !shoulderRightSide.getOrDefault(id, true));
    }

    /** Per-tick update of every active camera rig's smoothed, collision-checked position. */
    private void updateAllRigs() {
        for (Map.Entry<UUID, ArmorStand> entry : cameraRigs.entrySet()) {
            Player player = Bukkit.getPlayer(entry.getKey());
            ArmorStand rig = entry.getValue();
            if (player == null || !rig.isValid()) continue;

            Location ideal = computeIdealCameraPosition(player);
            Location current = smoothedPosition.getOrDefault(player.getUniqueId(), ideal);
            Location smoothed = lerp(current, ideal, LERP_FACTOR);

            smoothedPosition.put(player.getUniqueId(), smoothed);
            rig.teleport(smoothed);
        }
    }

    /** Computes the target camera position behind/above the player, adjusted for wall collisions. */
    private Location computeIdealCameraPosition(Player player) {
        Location eye = player.getEyeLocation();
        Vector back = eye.getDirection().normalize().multiply(-CAMERA_DISTANCE);
        double shoulderSign = shoulderRightSide.getOrDefault(player.getUniqueId(), true) ? 1 : -1;
        Vector side = eye.getDirection().clone().crossProduct(new Vector(0, 1, 0)).normalize().multiply(SHOULDER_OFFSET * shoulderSign);

        Location target = eye.clone().add(back).add(side).add(0, HEIGHT_OFFSET - 1.0, 0);
        return avoidCollisions(eye, target);
    }

    /** Raycasts from the player toward the target camera spot; pulls the camera in if it hits terrain. */
    private Location avoidCollisions(Location from, Location to) {
        Vector direction = to.toVector().subtract(from.toVector());
        double distance = direction.length();
        if (distance < 0.01) return to;

        RayTraceResult hit = from.getWorld().rayTraceBlocks(from, direction.normalize(), distance);
        if (hit != null && hit.getHitPosition() != null) {
            return hit.getHitPosition().toLocation(from.getWorld()).subtract(direction.normalize().multiply(0.3));
        }
        return to;
    }

    private Location lerp(Location from, Location to, double factor) {
        double x = from.getX() + (to.getX() - from.getX()) * factor;
        double y = from.getY() + (to.getY() - from.getY()) * factor;
        double z = from.getZ() + (to.getZ() - from.getZ()) * factor;
        return new Location(to.getWorld(), x, y, z);
    }
}
