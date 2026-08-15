# ScripForge ForgeClient Plugin Manager (Minecraft)

A small standalone desktop tool for managing the Bukkit/Spigot/Paper plugin
JAR files in your Minecraft server's `plugins/` folder.

## What this tool does

- Lists every plugin JAR (and disabled JAR) in a folder you choose.
- Reads each JAR's bundled `plugin.yml` (JAR files are just ZIP files, so
  this is done with Java's built-in `java.util.zip` package — no extra
  libraries) and shows the plugin's name, version, and main class.
- Lets you **enable** or **disable** a plugin with one click. Disabling
  renames `SomePlugin.jar` to `SomePlugin.jar.disabled` in place; enabling
  reverses that. Your server ignores anything that doesn't end in `.jar`,
  so this is a safe, non-destructive way to toggle a plugin off without
  deleting it.
- Lets you open the plugin's containing folder in your normal OS file
  explorer (Windows Explorer, Finder, etc.) with one click.

## What this tool does NOT do

This tool manages plugin JAR files in your server's plugins folder. **It
does not connect to a running Minecraft server or inject any code into the
game** — it's a local file manager for plugin JARs. It never starts, stops,
or communicates with a server process, and it never edits the contents of a
JAR file; it only reads metadata from it and renames the file on disk.

## Where do the JAR files come from?

ScripForge sells Minecraft plugin **source code** (`.java` files), not
pre-built JARs — see the `.java` files under `generated-scripts/minecraft/`
in the main ScripForge project (for example
`land-claim-protection-system.java`, `custom-boss-mob-arena.java`, and
`player-shop-trading-stall.java`). To actually run one of these scripts on
your server, you (or whoever manages your server) compile it against the
Bukkit/Spigot/Paper API into a `.jar` file using your normal Java build
process (e.g. Maven or Gradle with the Spigot/Paper API as a dependency).
Once you have that compiled `.jar`, drop it into your server's `plugins/`
folder — that's the folder you point this tool at.

This Plugin Manager app itself is a completely separate, ordinary Java
Swing desktop program with no Bukkit/Spigot/Paper dependency at all; it just
reads and renames files.

## Requirements

- A JDK (Java Development Kit), **version 11 or newer**. This project was
  built and tested against JDK 17. You can check your version with:

  ```
  java -version
  javac -version
  ```

## How to compile

From the `generated-clients/minecraft/` directory (the one containing this
README and the `src/` folder), run:

```
javac -d out src/com/scripforge/pluginmanager/*.java
```

This compiles all five source files and writes the resulting `.class`
files into an `out/` directory, mirroring the `com/scripforge/pluginmanager`
package structure.

## How to run

After compiling, still from the `generated-clients/minecraft/` directory,
run:

```
java -cp out com.scripforge.pluginmanager.PluginManagerApp
```

A window titled "ScripForge ForgeClient Plugin Manager" should appear.
Click **Open Plugins Folder...** and select your server's `plugins/`
directory to get started.

## Using the app

1. **Open Plugins Folder...** — choose the `plugins/` folder of the server
   you want to manage.
2. The table fills in with every `.jar` and `.jar.disabled` file found
   there, showing the file name, the plugin's declared name/version/main
   class (read from `plugin.yml`, or "unknown" if that couldn't be
   determined), and whether it's currently Enabled or Disabled.
3. Select a row and click **Enable** or **Disable** to toggle it. The
   underlying file is renamed on disk immediately.
4. Click **Refresh** any time to re-scan the folder (for example, after
   dropping in a newly compiled JAR from outside the app).
5. Click **Open Containing Folder** to reveal the selected plugin's file
   (or, if nothing is selected, the whole plugins folder) in your system's
   file explorer.

If a JAR is corrupted, locked by another program, or simply doesn't contain
a `plugin.yml`, the app shows "unknown" for its metadata fields instead of
crashing — you can still enable, disable, and locate the file normally.
