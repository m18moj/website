/*
 * ScriptForge — Custom Enchantment Registry
 * Pack: Minecraft Pack | Category: Systems
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Registry for defining custom enchantments with their own apply/trigger logic, stored as NBT-style lore tags on items.
 *
 * Bukkit/Spigot/Paper plugin module — drop into your plugin's source tree.
 */

package com.scriptforge.minecraft.systems;

import org.bukkit.ChatColor;
import org.bukkit.entity.LivingEntity;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.EntityDamageByEntityEvent;
import org.bukkit.event.enchantment.EnchantItemEvent;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;
import org.bukkit.plugin.java.JavaPlugin;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.BiConsumer;

/**
 * CustomEnchantmentRegistry lets plugin authors register enchantments that
 * don't exist in vanilla Minecraft. Each custom enchantment is identified by
 * a unique key, has a max level, and a trigger callback that runs on a
 * relevant event (here: dealing melee damage). Custom enchants are tracked
 * via a plain-text lore tag rather than real NBT for portability.
 */
public class CustomEnchantmentRegistry extends JavaPlugin implements Listener {

    /** Definition of one custom enchantment: display name, max level, and its effect. */
    public static class CustomEnchant {
        final String key;
        final String displayName;
        final int maxLevel;
        final BiConsumer<Player, LivingEntity> onHit;

        public CustomEnchant(String key, String displayName, int maxLevel, BiConsumer<Player, LivingEntity> onHit) {
            this.key = key;
            this.displayName = displayName;
            this.maxLevel = maxLevel;
            this.onHit = onHit;
        }
    }

    private final Map<String, CustomEnchant> registry = new HashMap<>();

    @Override
    public void onEnable() {
        getServer().getPluginManager().registerEvents(this, this);
        registerDefaults();
        getLogger().info("CustomEnchantmentRegistry enabled with " + registry.size() + " enchantment(s).");
    }

    /** Seeds two example enchants; more can be added via registerEnchant(). */
    private void registerDefaults() {
        registerEnchant(new CustomEnchant("lifesteal", "Lifesteal", 3, (player, target) -> {
            double healAmount = 1.0 * getLevel(player.getInventory().getItemInMainHand(), "lifesteal");
            double maxHealth = player.getAttribute(org.bukkit.attribute.Attribute.GENERIC_MAX_HEALTH).getValue();
            player.setHealth(Math.min(maxHealth, player.getHealth() + healAmount));
        }));

        registerEnchant(new CustomEnchant("static_shock", "Static Shock", 2, (player, target) -> {
            int level = getLevel(player.getInventory().getItemInMainHand(), "static_shock");
            target.addPotionEffect(new org.bukkit.potion.PotionEffect(
                    org.bukkit.potion.PotionEffectType.SLOW, 20 * level, 1));
        }));
    }

    /** Registers a new custom enchantment definition. Overwrites any existing entry with the same key. */
    public void registerEnchant(CustomEnchant enchant) {
        registry.put(enchant.key, enchant);
    }

    /** Applies a custom enchant to an item at the given level, tagging it via lore. */
    public ItemStack applyEnchant(ItemStack item, String key, int level) {
        CustomEnchant enchant = registry.get(key);
        if (enchant == null || level < 1 || level > enchant.maxLevel) return item;

        ItemMeta meta = item.getItemMeta();
        List<String> lore = meta.hasLore() ? new ArrayList<>(meta.getLore()) : new ArrayList<>();
        lore.add(ChatColor.DARK_PURPLE + enchant.displayName + " " + toRoman(level));
        meta.setLore(lore);
        item.setItemMeta(meta);
        return item;
    }

    /** Reads the level of a custom enchant off an item's lore tags, or 0 if absent. */
    private int getLevel(ItemStack item, String key) {
        CustomEnchant enchant = registry.get(key);
        if (enchant == null || item == null || !item.hasItemMeta() || !item.getItemMeta().hasLore()) return 0;

        for (String line : item.getItemMeta().getLore()) {
            String stripped = ChatColor.stripColor(line);
            if (stripped != null && stripped.startsWith(enchant.displayName)) {
                String roman = stripped.substring(enchant.displayName.length()).trim();
                return fromRoman(roman);
            }
        }
        return 0;
    }

    @EventHandler
    public void onMeleeHit(EntityDamageByEntityEvent event) {
        if (!(event.getDamager() instanceof Player) || !(event.getEntity() instanceof LivingEntity)) return;

        Player attacker = (Player) event.getDamager();
        LivingEntity target = (LivingEntity) event.getEntity();
        ItemStack weapon = attacker.getInventory().getItemInMainHand();

        for (CustomEnchant enchant : registry.values()) {
            if (getLevel(weapon, enchant.key) > 0) {
                enchant.onHit.accept(attacker, target);
            }
        }
    }

    /** Blocked here only to demonstrate hooking vanilla enchant table drops for custom enchants too. */
    @EventHandler
    public void onVanillaEnchant(EnchantItemEvent event) {
        // Left as an extension point: roll a chance here to also grant a random custom enchant.
    }

    private String toRoman(int level) {
        String[] numerals = {"I", "II", "III", "IV", "V"};
        return level >= 1 && level <= numerals.length ? numerals[level - 1] : String.valueOf(level);
    }

    private int fromRoman(String roman) {
        switch (roman) {
            case "I": return 1;
            case "II": return 2;
            case "III": return 3;
            case "IV": return 4;
            case "V": return 5;
            default: return 0;
        }
    }
}
