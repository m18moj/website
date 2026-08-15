/*
 * ScripForge — ForgeClient Plugin Manager (Minecraft)
 * Component: PluginScanner
 * Version: 1.0.0
 *
 * Scans a directory for plugin JAR files and extracts name/version/main-class
 * metadata from each JAR's embedded plugin.yml without any YAML library.
 *
 * Standalone desktop tool for managing Bukkit/Spigot/Paper plugin JARs in a
 * server's plugins folder. Does not connect to or modify a running server.
 */

package com.scripforge.pluginmanager;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

/**
 * Walks a "plugins" folder and builds a {@link PluginInfo} for every JAR it
 * finds. Two file naming conventions are recognized as "the same plugin at
 * rest":
 *
 * <ul>
 *   <li>{@code SomePlugin.jar} — active, will be loaded by the server</li>
 *   <li>{@code SomePlugin.jar.disabled} — inactive, ignored by the server</li>
 * </ul>
 *
 * This scanner never writes anything to disk; it only reads. All I/O errors
 * for an individual JAR are swallowed and turned into "unknown" metadata
 * fields so that one corrupt or locked file can never crash a whole scan.
 */
public class PluginScanner {

    /** Name of the metadata file Bukkit/Spigot/Paper plugins are required to bundle. */
    private static final String PLUGIN_YML_ENTRY = "plugin.yml";

    /** Suffix used by this tool's "disable" convention. */
    static final String DISABLED_SUFFIX = ".disabled";

    /**
     * Scans {@code directory} (non-recursively — a real plugins folder is flat)
     * for plugin JARs and returns one {@link PluginInfo} per file found, sorted
     * alphabetically by file name.
     *
     * @param directory the folder to scan, typically the server's plugins/ dir
     * @return a list of discovered plugins, possibly empty, never null
     * @throws IOException if the directory itself cannot be read/listed
     */
    public List<PluginInfo> scan(Path directory) throws IOException {
        List<PluginInfo> results = new ArrayList<>();

        if (directory == null || !Files.isDirectory(directory)) {
            return results;
        }

        try (DirectoryStream<Path> stream = Files.newDirectoryStream(directory)) {
            for (Path entry : stream) {
                if (Files.isDirectory(entry)) {
                    continue;
                }
                String fileName = entry.getFileName().toString();
                boolean isActiveJar = fileName.toLowerCase().endsWith(".jar");
                boolean isDisabledJar = fileName.toLowerCase().endsWith(".jar" + DISABLED_SUFFIX);

                if (!isActiveJar && !isDisabledJar) {
                    continue;
                }

                results.add(readPluginInfo(entry, fileName, isActiveJar));
            }
        }

        results.sort(Comparator.comparing(PluginInfo::getFileName, String.CASE_INSENSITIVE_ORDER));
        return results;
    }

    /**
     * Attempts to open {@code jarPath} as a ZIP archive and read its
     * plugin.yml entry. On any failure (not a real ZIP, missing entry, IO
     * error) this falls back to "unknown" metadata rather than propagating
     * the exception, since a single bad JAR should not stop the whole scan.
     */
    private PluginInfo readPluginInfo(Path jarPath, String fileName, boolean enabled) {
        String name = PluginInfo.UNKNOWN;
        String version = PluginInfo.UNKNOWN;
        String mainClass = PluginInfo.UNKNOWN;

        try (ZipFile zip = new ZipFile(jarPath.toFile())) {
            ZipEntry ymlEntry = zip.getEntry(PLUGIN_YML_ENTRY);
            if (ymlEntry != null) {
                try (InputStream in = zip.getInputStream(ymlEntry)) {
                    String[] parsed = parsePluginYaml(in);
                    name = parsed[0];
                    version = parsed[1];
                    mainClass = parsed[2];
                }
            }
        } catch (IOException | RuntimeException ex) {
            // Corrupt JAR, locked file, not actually a ZIP, etc. Leave fields
            // as "unknown" and keep going — this is expected for hand-edited
            // or partially-downloaded files and must never crash the app.
        }

        return new PluginInfo(jarPath, fileName, name, version, mainClass, enabled);
    }

    /**
     * Extremely small line-based reader for plugin.yml. This is intentionally
     * NOT a general YAML parser — it just looks for top-level
     * {@code name:}, {@code version:}, and {@code main:} keys, which is all
     * Bukkit/Spigot/Paper actually require plugin.yml to contain for our
     * purposes. Quotes around values are stripped if present.
     *
     * @return a 3-element array: [name, version, mainClass], each defaulting
     *         to {@link PluginInfo#UNKNOWN} if the key wasn't found
     */
    private String[] parsePluginYaml(InputStream in) throws IOException {
        String name = PluginInfo.UNKNOWN;
        String version = PluginInfo.UNKNOWN;
        String mainClass = PluginInfo.UNKNOWN;

        try (BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                String trimmed = line.trim();
                if (trimmed.isEmpty() || trimmed.startsWith("#")) {
                    continue;
                }

                String value = valueAfterKey(trimmed, "name:");
                if (value != null) {
                    name = value;
                    continue;
                }
                value = valueAfterKey(trimmed, "version:");
                if (value != null) {
                    version = value;
                    continue;
                }
                value = valueAfterKey(trimmed, "main:");
                if (value != null) {
                    mainClass = value;
                }
            }
        }

        return new String[] { name, version, mainClass };
    }

    /**
     * If {@code line} starts with {@code key} (case-sensitive, as YAML keys
     * are), returns the trimmed, unquoted value that follows. Otherwise
     * returns null. Only matches at the start of the line so that indented
     * nested keys (like "commands:" sub-blocks) are not mistaken for the
     * top-level key of the same name.
     */
    private String valueAfterKey(String line, String key) {
        if (!line.startsWith(key)) {
            return null;
        }
        String raw = line.substring(key.length()).trim();
        // Strip a single layer of surrounding quotes, if present.
        if (raw.length() >= 2) {
            char first = raw.charAt(0);
            char last = raw.charAt(raw.length() - 1);
            if ((first == '"' && last == '"') || (first == '\'' && last == '\'')) {
                raw = raw.substring(1, raw.length() - 1);
            }
        }
        return raw.isEmpty() ? PluginInfo.UNKNOWN : raw;
    }
}
