/*
 * ScripForge — ForgeClient Plugin Manager (Minecraft)
 * Component: PluginManagerApp
 * Version: 1.0.0
 *
 * Application entry point: sets up the Swing look-and-feel and launches the
 * main window on the Event Dispatch Thread.
 *
 * Standalone desktop tool for managing Bukkit/Spigot/Paper plugin JARs in a
 * server's plugins folder. Does not connect to or modify a running server.
 */

package com.scripforge.pluginmanager;

import javax.swing.SwingUtilities;
import javax.swing.UIManager;

/**
 * Entry point for the ScripForge ForgeClient Plugin Manager.
 *
 * <p>This is a local desktop utility for server admins: it lists the plugin
 * JAR files sitting in a Bukkit/Spigot/Paper server's {@code plugins/}
 * folder, lets you enable/disable them by renaming, shows each JAR's
 * {@code plugin.yml} metadata, and can open the containing folder in your
 * OS file explorer. It never launches, connects to, or otherwise touches a
 * running Minecraft server process.</p>
 */
public final class PluginManagerApp {

    private PluginManagerApp() {
        // Not instantiable — this class only holds main().
    }

    public static void main(String[] args) {
        // Use the host OS's native-looking Swing theme when available so the
        // tool feels at home on Windows, macOS, and Linux alike. If this
        // fails for any reason, Swing's default cross-platform theme is used
        // instead — never worth crashing startup over.
        try {
            UIManager.setLookAndFeel(UIManager.getSystemLookAndFeelClassName());
        } catch (Exception ex) {
            // Fall back silently to the default Swing look and feel.
        }

        // All Swing UI construction and mutation must happen on the Event
        // Dispatch Thread (EDT); invokeLater schedules our startup code
        // there regardless of what thread main() itself is running on.
        SwingUtilities.invokeLater(() -> {
            MainWindow window = new MainWindow();
            window.show();
        });
    }
}
