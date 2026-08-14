/*
 * ScriptForge — Player Shop & Trading Stall
 * Pack: Minecraft Pack | Category: Economy
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Player-run shop stalls where owners list items with prices and other players can browse and purchase via GUI.
 *
 * Bukkit/Spigot/Paper plugin module — drop into your plugin's source tree.
 */

package com.scriptforge.minecraft.economy;

import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.inventory.InventoryClickEvent;
import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.ItemStack;
import org.bukkit.plugin.java.JavaPlugin;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * PlayerShopTradingStall lets a player set up a stall at a location, list
 * items for sale at a fixed price, and lets other players purchase via a
 * simple inventory GUI. Balances are tracked in-memory; wire getBalance /
 * addBalance / removeBalance into your real economy plugin (e.g. Vault) for
 * production use.
 */
public class PlayerShopTradingStall extends JavaPlugin implements Listener {

    /** One stall: owner, location, listed item, price, and stock quantity. */
    public static class Stall {
        final UUID ownerId;
        final Location location;
        ItemStack listedItem;
        double price;
        int stock;

        Stall(UUID ownerId, Location location, ItemStack listedItem, double price, int stock) {
            this.ownerId = ownerId;
            this.location = location;
            this.listedItem = listedItem;
            this.price = price;
            this.stock = stock;
        }
    }

    private final Map<UUID, Stall> stallsByOwner = new HashMap<>();
    private final Map<UUID, Double> balances = new HashMap<>();
    private final Map<UUID, UUID> openShopViewers = new HashMap<>(); // viewer -> owner being browsed

    @Override
    public void onEnable() {
        getServer().getPluginManager().registerEvents(this, this);
        getLogger().info("PlayerShopTradingStall enabled.");
    }

    /** Creates or replaces a stall for the given owner at their current location. */
    public void createStall(Player owner, ItemStack item, double price, int stock) {
        Stall stall = new Stall(owner.getUniqueId(), owner.getLocation(), item.clone(), price, stock);
        stallsByOwner.put(owner.getUniqueId(), stall);
        owner.sendMessage("Stall created: " + stock + "x " + item.getType() + " @ " + price + " each.");
    }

    /** Opens a browsing GUI for a shopper to view and buy from an owner's stall. */
    public void openStall(Player shopper, UUID ownerId) {
        Stall stall = stallsByOwner.get(ownerId);
        if (stall == null || stall.stock <= 0) {
            shopper.sendMessage("That stall is empty or does not exist.");
            return;
        }

        Inventory gui = Bukkit.createInventory(null, 9, "Stall: " + stall.price + " ea (" + stall.stock + " left)");
        gui.setItem(4, stall.listedItem.clone());
        openShopViewers.put(shopper.getUniqueId(), ownerId);
        shopper.openInventory(gui);
    }

    @EventHandler
    public void onStallClick(InventoryClickEvent event) {
        if (!(event.getWhoClicked() instanceof Player)) return;
        Player shopper = (Player) event.getWhoClicked();
        UUID ownerId = openShopViewers.get(shopper.getUniqueId());
        if (ownerId == null || event.getSlot() != 4) return;

        event.setCancelled(true);
        purchase(shopper, ownerId, 1);
    }

    /** Processes a purchase of the given quantity from a stall, transferring funds and stock. */
    public boolean purchase(Player buyer, UUID ownerId, int quantity) {
        Stall stall = stallsByOwner.get(ownerId);
        if (stall == null || stall.stock < quantity) {
            buyer.sendMessage("Not enough stock available.");
            return false;
        }

        double total = stall.price * quantity;
        double buyerBalance = getBalance(buyer.getUniqueId());
        if (buyerBalance < total) {
            buyer.sendMessage("Insufficient funds. Need " + total + ".");
            return false;
        }

        removeBalance(buyer.getUniqueId(), total);
        addBalance(ownerId, total);
        stall.stock -= quantity;

        ItemStack purchased = stall.listedItem.clone();
        purchased.setAmount(quantity);
        buyer.getInventory().addItem(purchased);
        buyer.sendMessage("Purchased " + quantity + "x " + stall.listedItem.getType() + " for " + total + ".");
        return true;
    }

    /** Removes a stall entirely, refunding no leftover stock (owner should collect manually). */
    public void closeStall(Player owner) {
        stallsByOwner.remove(owner.getUniqueId());
        owner.sendMessage("Stall closed.");
    }

    private double getBalance(UUID playerId) {
        return balances.getOrDefault(playerId, 100.0); // demo starting balance
    }

    private void addBalance(UUID playerId, double amount) {
        balances.put(playerId, getBalance(playerId) + amount);
    }

    private void removeBalance(UUID playerId, double amount) {
        balances.put(playerId, getBalance(playerId) - amount);
    }
}
