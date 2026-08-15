# ScripForge Client for Skyrim (MCM Menu)

This is the in-game configuration client for ScripForge's Skyrim script
pack. It's a standard SkyUI Mod Configuration Menu (MCM) — the same
mechanism used by thousands of Skyrim mods to expose settings through the
pause menu. It does not inject anything or bypass any game system; it's
built entirely on Bethesda's Creation Kit / Papyrus scripting language and
SkyUI's officially documented `SKI_ConfigBase` API.

## What's in this folder

- `ForgeClientMCM.psc` — the MCM menu's Papyrus source script.
- `ForgeClientMCM_MCM.ini` — metadata SkyUI's MCM system reads (mod name, ID,
  page list).
- `README.md` — this file.

## IMPORTANT: this .psc must be compiled before it will do anything

**A `.psc` file is Papyrus *source code*, not a runnable script.** Skyrim
only loads compiled `.pex` bytecode. Simply dropping `ForgeClientMCM.psc`
into your Data folder will do nothing in-game — you must compile it first.
You have two options:

1. **Creation Kit (recommended for most users)** — Install the free Skyrim
   Creation Kit (available via Steam for Skyrim Special Edition/AE, or
   separately for LE). Open the Papyrus Compiler
   (`Papyrus Compiler.exe`, ships with the CK) and point it at
   `ForgeClientMCM.psc`, or compile from inside the CK itself. Make sure its
   import paths include both the vanilla `Scripts\Source` folder and SkyUI's
   `Scripts\Source` folder (SkyUI ships `SKI_ConfigBase.psc`, which this
   script depends on).
2. **A standalone Papyrus compiler** such as Champollion (decompiler) is not
   what you want here — for compiling *source* to `.pex`, use the Creation
   Kit's `PapyrusCompiler.exe` directly from the command line, e.g.:
   ```
   PapyrusCompiler.exe "ForgeClientMCM.psc" -f="TESV_Papyrus_Flags.flg" -i="Data\Scripts\Source" -o="Data\Scripts"
   ```
   Adjust paths for your install. This produces `ForgeClientMCM.pex`.

Either way, you need the resulting `ForgeClientMCM.pex` file — that's what
actually ships to end users and gets placed in-game. The `.psc` is the
human-readable source, included so the script can be audited, modified, and
recompiled.

## Requirements

- Skyrim (Special Edition, Anniversary Edition, or Legendary Edition; adjust
  compiler flags accordingly)
- **SKSE** (Skyrim Script Extender) — required by SkyUI
- **SkyUI** (version 5.1 or later recommended) — provides the MCM framework
  (`SKI_ConfigBase`) this script extends, and the in-game menu UI itself
- The purchased ScripForge Skyrim script pack (the `.psc`/`.pex` files under
  `generated-scripts/skyrim/`), since this MCM only exposes settings for
  those scripts — it doesn't replace them

## Installation

1. Install SKSE and SkyUI first, following their normal installation
   instructions (usually via a mod manager such as Mod Organizer 2 or Vortex).
2. Compile `ForgeClientMCM.psc` to `ForgeClientMCM.pex` as described above.
3. Copy the following into your Skyrim `Data` folder (or into a mod manager's
   mod folder, which is generally the safer/preferred approach):
   - `ForgeClientMCM.pex` → `Data\Scripts\`
   - `ForgeClientMCM.psc` → `Data\Scripts\Source\` (optional, but keeps the
     source alongside the compiled script for future edits)
   - `ForgeClientMCM_MCM.ini` → `Data\MCM\Config\ForgeClientMCM\` (create this
     folder if it doesn't exist)
   - The compiled `.pex` files from your purchased ScripForge script pack
     (`generated-scripts/skyrim/*.pex` once you've compiled those too) →
     `Data\Scripts\`
4. This MCM menu script needs to run on a quest object in your game world so
   SkyUI can detect it. If you're packaging this as part of a mod with its
   own `.esp`/`.esl` plugin, attach `ForgeClientMCM` as the script on a quest
   in that plugin (via the Creation Kit) with `Start Game Enabled` checked, a
   `Priority` set, and no conditions blocking it from running. If you don't
   already have a plugin, create a minimal one in the Creation Kit with a
   single always-running quest and attach this script to it.
5. Launch Skyrim through SKSE (e.g. `skse64_loader.exe`), not the vanilla
   launcher.

## Finding the menu in-game

1. Load a save (or start a new game).
2. Press **Esc** to open the pause menu.
3. Select the **Mod Configuration** tab (added by SkyUI; it appears once
   SkyUI and at least one MCM-enabled mod are installed).
4. Find **"ScripForge Client"** in the mod list on the left.
5. You'll see four pages: **Followers & Home**, **Crime & Reputation**,
   **Progression**, and **World & Economy** — each with toggles, sliders,
   and dropdown menus tied to the corresponding scripts in the pack (follower
   caps, bounty values, legendary skill thresholds, merchant restock timing,
   weather effect intensity, radiant world event frequency, and more).

If the "Mod Configuration" tab never appears, double-check that SkyUI is
correctly installed and that you launched via SKSE — MCM will not appear at
all without SkyUI loaded successfully.

## Note on wiring settings into the gameplay scripts

Some settings in this menu (for example `MaxActiveFollowers` or
`LegendarySkillThreshold`) mirror equivalent `Property` values already
declared on the individual gameplay scripts in `generated-scripts/skyrim/`.
For a change made in this menu to affect those scripts at runtime, a mod
author needs to either point the gameplay script's Property at the same
`GlobalVariable` this menu writes to, or otherwise read this menu's quest
Properties at runtime. This is called out directly in the comments at the
top of `ForgeClientMCM.psc`.
