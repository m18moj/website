/*
 * ScriptForge — ForgeClient Plugin Manager (Minecraft)
 * Component: PluginInfo
 * Version: 1.0.0
 *
 * Immutable-ish data holder describing one discovered plugin JAR file and the
 * metadata (if any) that was parsed out of its bundled plugin.yml.
 *
 * Standalone desktop tool for managing Bukkit/Spigot/Paper plugin JARs in a
 * server's plugins folder. Does not connect to or modify a running server.
 */

package com.scriptforge.pluginmanager;

import java.nio.file.Path;

/**
 * Represents a single plugin JAR discovered on disk in the server's
 * {@code plugins/} folder, plus whatever metadata could be read from its
 * {@code plugin.yml} entry.
 *
 * <p>Instances are simple mutable-free value holders. A new {@link PluginInfo}
 * is created every time the folder is (re)scanned, so there is no need for
 * setters — callers just discard the old list and use the new one.</p>
 */
public class PluginInfo {

    /** Value used for any metadata field that could not be determined. */
    public static final String UNKNOWN = "unknown";

    /** Absolute path to the JAR file on disk (may end in ".disabled"). */
    private final Path filePath;

    /** Just the file name portion of {@link #filePath}, e.g. "MyPlugin.jar.disabled". */
    private final String fileName;

    /** Plugin display name from plugin.yml's "name:" line, or {@link #UNKNOWN}. */
    private final String pluginName;

    /** Plugin version from plugin.yml's "version:" line, or {@link #UNKNOWN}. */
    private final String version;

    /** Plugin main class from plugin.yml's "main:" line, or {@link #UNKNOWN}. */
    private final String mainClass;

    /** True if this JAR is currently active (no ".disabled" suffix), false otherwise. */
    private final boolean enabled;

    public PluginInfo(Path filePath, String fileName, String pluginName,
                       String version, String mainClass, boolean enabled) {
        this.filePath = filePath;
        this.fileName = fileName;
        this.pluginName = pluginName;
        this.version = version;
        this.mainClass = mainClass;
        this.enabled = enabled;
    }

    public Path getFilePath() {
        return filePath;
    }

    public String getFileName() {
        return fileName;
    }

    public String getPluginName() {
        return pluginName;
    }

    public String getVersion() {
        return version;
    }

    public String getMainClass() {
        return mainClass;
    }

    public boolean isEnabled() {
        return enabled;
    }

    /** Human-readable status string used directly in the table's Status column. */
    public String getStatusLabel() {
        return enabled ? "Enabled" : "Disabled";
    }

    @Override
    public String toString() {
        return fileName + " (" + pluginName + " " + version + ", " + getStatusLabel() + ")";
    }
}
