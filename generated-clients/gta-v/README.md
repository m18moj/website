# ScripForge ForgeClient — GTA V

The in-game menu that ties the ScripForge GTA V script pack together. It doesn't add new
gameplay by itself — it gives you a single settings screen, opened with a hotkey while you're
playing, to turn each purchased script's feature on or off and adjust a few of their settings.

**For single-player use only. Do not use in GTA Online — modifying GTA Online can get your
account banned and violates Rockstar's terms of service.**

## Requirements

Install these first, in order, if you don't already have them:

1. **Script Hook V** by Alexander Blade — the native hook that lets any script code run
   inside GTA V. Download from the official Script Hook V site and follow its install
   instructions (it drops a couple of files into your GTA V install folder).
2. **Script Hook V .NET (SHVDN)** — the .NET wrapper that lets C# scripts like this one run
   on top of Script Hook V. Install it into the same GTA V folder; it will create (or expect)
   a `Scripts` subfolder in your GTA V install directory if one doesn't already exist.

Both of these are third-party community tools, not made by ScripForge. Grab them from their
official/community-trusted sources and keep them updated to match your game version — a
version mismatch is the most common reason scripts fail to load after a GTA V update.

## Installing ForgeClient + your ScripForge pack

1. Locate your GTA V install folder (the one with `GTA5.exe` in it) and open the `Scripts`
   folder inside it. If it doesn't exist, create it.
2. Copy **both** files from this folder into `Scripts`:
   - `ForgeClientMenu.cs`
   - `ForgeClientConfig.cs`
3. Copy every `.cs` file from your purchased ScripForge GTA V pack into that same `Scripts`
   folder, alongside the two files above (they all need to sit next to each other).
4. Launch GTA V normally and load into single-player story mode. Script Hook V .NET compiles
   and loads the `.cs` files automatically the first time you enter the world — no separate
   build step required.

## Using the menu

- Press **F9** in-game to open or close the ForgeClient menu (remap it by editing
  `ForgeClientConfig.MenuToggleKey` in `ForgeClientConfig.cs` before launching, if you'd
  rather use a different key).
- **Up / Down** — move the selection.
- **Enter** — toggle a feature on/off, or open a submenu (features with a `>` after their
  status have extra settings — Weather Control, Parachute Assist, and Wanted Level Manager
  currently do).
- **Left / Right** — same as Enter for simple on/off rows, and used to cycle values inside a
  submenu (e.g. stepping through weather types or nudging the max wanted-star cap).
- **Backspace / Escape** — back out of a submenu, or close the menu entirely from the main
  screen.

Every row in the main menu corresponds to one script in the pack (Garage & Vehicle Storage,
Weather Control, Parachute Assist, Gang Territory Control, Wanted Level Manager, Police Chase
Tweaks, Stock Market & Investments, Wardrobe & Customization, NPC Traffic AI, Stunt Jump Score
Tracker, Economy & Property System, and Heist Preparation Flow). Toggling a row here only
takes effect in scripts that check the matching flag in `ForgeClientConfig.cs` — that's the
documented, supported way each ScripForge script opts into being controlled by this menu.

## Troubleshooting

- **Nothing happens when I press F9.** Check `ScriptHookVDotNet.log` in your GTA V folder for
  compile errors — usually it means a `.cs` file is missing a dependency or your Script Hook V
  .NET version is out of date for your game version.
- **Menu opens but a toggle doesn't seem to do anything.** Make sure the corresponding pack
  script file is actually present in `Scripts` — the menu can flip a setting even if the
  script that reads it isn't installed.
- **Game crashes or scripts stop loading after a GTA V update.** Update Script Hook V and
  Script Hook V .NET to versions that match your new game build before reporting an issue.

## Support

Questions about the pack or this menu can go through the ScripForge marketplace listing you
purchased from.
