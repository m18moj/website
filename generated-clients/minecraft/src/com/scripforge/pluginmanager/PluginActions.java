/*
 * ScripForge — ForgeClient Plugin Manager (Minecraft)
 * Component: PluginActions
 * Version: 1.0.0
 *
 * File-system actions the UI can trigger on a discovered plugin JAR: enable,
 * disable, and revealing the containing folder in the OS file explorer.
 *
 * Standalone desktop tool for managing Bukkit/Spigot/Paper plugin JARs in a
 * server's plugins folder. Does not connect to or modify a running server.
 */

package com.scripforge.pluginmanager;

import java.awt.Desktop;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;

/**
 * Implements the "enable" / "disable" convention used throughout this tool:
 * a disabled plugin JAR is simply the active JAR's file name with a
 * {@code .disabled} suffix appended, sitting in the same folder. The server
 * only loads files that literally end in {@code .jar}, so renaming is enough
 * to toggle a plugin without deleting anything or touching server state.
 *
 * <p>Example: {@code EconomyPlugin.jar} (active) &lt;-&gt;
 * {@code EconomyPlugin.jar.disabled} (inactive).</p>
 */
public class PluginActions {

    /**
     * Disables an active plugin by renaming {@code Foo.jar} to
     * {@code Foo.jar.disabled} in the same directory.
     *
     * @param plugin the plugin to disable; must currently be enabled
     * @return a new PluginInfo reflecting the renamed file and disabled state
     * @throws IOException          if the rename fails (permissions, file in use, etc.)
     * @throws IllegalStateException if the plugin is already disabled
     */
    public PluginInfo disable(PluginInfo plugin) throws IOException {
        if (!plugin.isEnabled()) {
            throw new IllegalStateException("Plugin is already disabled: " + plugin.getFileName());
        }

        Path source = plugin.getFilePath();
        Path target = source.resolveSibling(source.getFileName().toString() + PluginScanner.DISABLED_SUFFIX);

        Files.move(source, target, StandardCopyOption.REPLACE_EXISTING);

        return new PluginInfo(target, target.getFileName().toString(), plugin.getPluginName(),
                plugin.getVersion(), plugin.getMainClass(), false);
    }

    /**
     * Enables a disabled plugin by stripping the trailing {@code .disabled}
     * suffix from its file name, e.g. {@code Foo.jar.disabled} -&gt; {@code Foo.jar}.
     *
     * @param plugin the plugin to enable; must currently be disabled
     * @return a new PluginInfo reflecting the renamed file and enabled state
     * @throws IOException           if the rename fails (permissions, file in use, etc.)
     * @throws IllegalStateException if the plugin is already enabled or its
     *                                file name unexpectedly lacks the ".disabled" suffix
     */
    public PluginInfo enable(PluginInfo plugin) throws IOException {
        if (plugin.isEnabled()) {
            throw new IllegalStateException("Plugin is already enabled: " + plugin.getFileName());
        }

        Path source = plugin.getFilePath();
        String sourceName = source.getFileName().toString();

        if (!sourceName.endsWith(PluginScanner.DISABLED_SUFFIX)) {
            throw new IllegalStateException("Expected a \"" + PluginScanner.DISABLED_SUFFIX
                    + "\" suffix on disabled plugin file: " + sourceName);
        }

        String activeName = sourceName.substring(0, sourceName.length() - PluginScanner.DISABLED_SUFFIX.length());
        Path target = source.resolveSibling(activeName);

        Files.move(source, target, StandardCopyOption.REPLACE_EXISTING);

        return new PluginInfo(target, target.getFileName().toString(), plugin.getPluginName(),
                plugin.getVersion(), plugin.getMainClass(), true);
    }

    /**
     * Opens the folder containing {@code plugin}'s JAR file in the host
     * operating system's file explorer (Windows Explorer, Finder, or a
     * Linux file manager registered with java.awt.Desktop).
     *
     * @param plugin the plugin whose containing folder should be opened
     * @throws IOException           if the OS reports it could not open the folder
     * @throws UnsupportedOperationException if this platform / headless
     *         environment does not support {@link Desktop#open(java.io.File)}
     */
    public void openContainingFolder(PluginInfo plugin) throws IOException {
        openFolder(plugin.getFilePath().getParent());
    }

    /**
     * Opens an arbitrary folder in the OS file explorer. Used both for
     * "Open Containing Folder" on a selected plugin and for jumping straight
     * to the currently-scanned plugins folder from the toolbar.
     *
     * @param folder the directory to reveal
     * @throws IOException                   if the OS reports it could not open the folder
     * @throws UnsupportedOperationException if Desktop.open is not supported
     *         on this platform (e.g. some headless Linux configurations)
     */
    public void openFolder(Path folder) throws IOException {
        if (folder == null || !Files.isDirectory(folder)) {
            throw new IOException("Folder does not exist: " + folder);
        }

        if (!Desktop.isDesktopSupported() || !Desktop.getDesktop().isSupported(Desktop.Action.OPEN)) {
            // Caller (MainWindow) catches this and shows a friendly dialog
            // instead of a stack trace, since headless/minimal Linux setups
            // commonly lack a registered file manager.
            throw new UnsupportedOperationException(
                    "Opening a folder in the system file explorer is not supported on this platform.");
        }

        Desktop.getDesktop().open(folder.toFile());
    }
}
