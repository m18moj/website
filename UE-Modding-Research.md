# Unreal Engine 4/5 Modding & Reverse Engineering — Technical Reference

---

## 1. UE4 vs UE5 Technical Differences

### Serialization Changes

UE5 introduced **dual global versioning** via `EUnrealEngineObjectUE4Version` and `EUnrealEngineObjectUE5Version`, with UE5 versions starting at `1000` to clearly differentiate from UE4's version 522. This means `.uasset` binaries carry internal "custom versions" (80+ per system) that control how data is read byte-by-byte. An asset saved with a newer custom version will **crash** an older engine trying to parse it because data offsets shift out of alignment.

**Key UE5 serialization versions:**
- `NAMES_REFERENCED_FROM_EXPORT_DATA` — Names table changes
- `PAYLOAD_TOC` — Payload table of contents
- `LARGE_WORLD_COORDINATES` — `FVector` components changed from `float` to `double` (24 bytes vs 12 bytes)
- `SCRIPT_SERIALIZATION_OFFSET` — Export table entries get script property serialization offset
- `PROPERTY_TAG_EXTENSION` — Overridable serialization on `UObject`
- `PROPERTY_TAG_COMPLETE_TYPE_NAME` — Complete type name in property tags
- `VERSE_CELLS` — Verse VM object graph support
- `IMPORT_TYPE_HIERARCHIES` — Hierarchical type info for imports

**Critical for modders:** Cooked data in UE5 is **unversioned** by default — headers are stripped of version info. This means the game directly loads data at hardcoded offsets. If any base class layout changes between game updates, mods built for the old version **will crash**. The `-VersionCookedContent` UAT flag can be used to retain versioning but is rarely exercised by commercial games.

### Nanite

Virtualized geometry system that replaces traditional LOD. Nanite meshes use a different serialization path — they store a specialized mesh representation rather than standard vertex/index buffers. Static meshes flagged as Nanite cannot be meaningfully edited by asset-level tools that only understand traditional mesh formats.

### Lumen

Dynamic global illumination and reflections. Lumen replaces baked lightmaps and requires DX12 + SM6. No direct modding impact beyond that shaders referencing Lumen require the corresponding Lumen shader code to be present in the game's shader library.

### IO Store (Zen Loader)

UE5 defaults to IO Store containers (`.ucas`/`.utoc`) instead of (or alongside) `.pak` files. This is the single biggest structural change for modders:

| Feature | UE4 (default) | UE5 (default) |
|---------|---------------|---------------|
| Archive format | `.pak` only | `.pak` + `.ucas`/`.utoc` |
| Unversioned assets | OFF | ON |
| IO Store | OFF | ON |
| Event-driven loading | ON | ON |

### Other UE5 Changes

- **World Partition** replaces level streaming (different actor loading model)
- **MetaSounds** replaces some Audio Engine components
- **Virtual Shadow Maps** replace traditional shadow maps
- **Large World Coordinates** (`double` precision vectors) — breaks binary compatibility with UE4 serialized data
- **Chaos Physics** replaces PhysX entirely
- **Enhanced Input** replaces legacy input system

---

## 2. Game Structure

### Typical UE4/5 Directory Layout

```
GameName/
├── Binaries/
│   └── Win64/
│       ├── GameName-Win64-Shipping.exe   (or -Editor.exe)
│       ├── GameName-Win64-Shipping.pdb   (debug symbols, sometimes shipped)
│       ├── dxil/                          (shader cache)
│       └── UE4SS.dll / UE4SS/            (if modded)
├── Content/
│   ├── Paks/
│   │   ├── GameName-WindowsNoEditor.pak           (base pak)
│   │   ├── GameName-WindowsNoEditor_0_P.pak       (first patch)
│   │   ├── GameName-WindowsNoEditor_1_P.pak       (second patch)
│   │   ├── GameName.utoc                           (UE5 IO Store)
│   │   ├── GameName.ucas                           (UE5 IO Store data)
│   │   ├── GameName.sig                            (pak signature)
│   │   └── ~mods/                                 (community mod convention)
│   │       └── MyMod_P.pak
│   └── Content/                                    (cooked assets)
├── Config/
│   ├── DefaultEngine.ini
│   ├── DefaultGame.ini
│   ├── DefaultInput.ini
│   ├── DefaultScalability.ini
│   └── Windows/                                    (platform-specific overrides)
└── Mods/                                          (some games)
```

### Config Hierarchy

Engine loads INI files in priority order:
1. `Default*.ini` (lowest priority, shipped defaults)
2. `Game/*.ini` (game-specific overrides)
3. `Platform/*.ini` (platform-specific)
4. `Saved/Config/` (user settings, highest priority)
5. Command-line `-ini=` overrides

### Pak File Priority/Loading Order

UE4/5 loads `.pak` files alphabetically. Priority is determined by:
- **Filename alphabetical order** — files in later paks override earlier ones
- **Patch number** — `_P` suffix indicates priority over non-patched
- **Subdirectory sorting** — `~mods` sorts after `pakchunk*` due to ASCII ordering of `~`
- **Patch level number** — higher numbers = higher priority within same group

**Convention:** Place mods in `{Game}/Content/Paks/~mods/` with naming like `MyModName_999999_P.pak`.

---

## 3. Asset Storage

### .pak File Format

**Magic:** `0x5A6F12E1` (44-byte footer)
**Versions:** 1–11 (corresponding to engine versions)

| Pak Version | UE Version | Key Feature |
|-------------|-----------|-------------|
| 1 | 4.0–4.2 | Initial |
| 2 | 4.0–4.2 | NoTimestamps |
| 3 | 4.3–4.15 | CompressionEncryption |
| 4 | 4.16–4.19 | IndexEncryption |
| 5 | 4.20 | RelativeChunkOffsets |
| 7 | 4.21 | EncryptionKeyGuid |
| 8A/8B | 4.22–4.24 | FNameBasedCompression |
| 9 | 4.25 | FrozenIndex |
| 10 | 4.26 | PathHashIndex |
| 11 | 4.26–5.3+ | Fnv64BugFix |

**Structure:**
```
[Data Records] [Index] [Footer (44 bytes)]
```

- Footer contains magic, version, index offset, index size, SHA1 hash
- Index contains mount point (usually `../../../`) and per-file records
- Each record: offset, compressed size, uncompressed size, compression method, SHA1, optional compression blocks
- Compression: None (0x00), ZLib (0x01), Oodle (0x10 bias memory / 0x20 bias speed)

### IO Store Format (UE5 Zen Loader)

| File | Purpose |
|------|---------|
| `.utoc` | Table of contents — asset IDs, offsets, sizes, chunk metadata |
| `.ucas` | Compressed/raw asset data |
| `.pak` | May still be present alongside for compatibility |

Key difference from `.pak`: Each asset has a **unique chunk ID**. You cannot simply add new assets to the archive — you must create a **patch** `.utoc` that the game loads alongside the originals.

### .uasset Structure

Every `.uasset` has:
1. **Package Summary** (header) — engine version, names count, exports count, imports count, offsets to bulk data, etc.
2. **Name Table** (`FNameEntry` strings) — all referenced identifiers
3. **Import Table** — references to external objects
4. **Export Table** — the actual objects in this package
5. **Bulk/Extra Data** — large binary payloads (meshes, textures, etc.)

**UE4 vs UE5 .uasset differences:**
- UE5 uses compact 2-byte-header FName pool (vs UE4's variable)
- UE5 cooked assets are **unversioned** — no custom version tags in headers
- UE5 `FVector` is `double` precision (24 bytes) vs UE4 `float` (12 bytes)

### .uexp Files

When "Event Driven Loading" is ON (default for UE4+), export data is stored in separate `.uexp` files alongside `.uasset`. This is the preferred format for modding tools.

---

## 4. Game Logic

### Blueprint System

Blueprints are the primary visual scripting system. In cooked assets:

1. **Blueprint logic is stored as Kismet bytecode** in the `.uasset` export data
2. Bytecode consists of `EExprToken` opcodes — function calls, variable access, control flow, etc.
3. Each Blueprint has an event graph with nodes, pins, and execution connections
4. When nativization is OFF (default), the game's VM interprets this bytecode at runtime
5. When Blueprint Nativization is ON, selected Blueprints are compiled to C++ — **making them impossible to reverse-engineer as Blueprints**

**Key Blueprint concepts for modders:**
- `UObject` base class — everything derives from this
- `UFunction` — the reflection system's function representation
- `ProcessEvent` — the VM's dispatch function (hooking target for UE4SS)
- `BlueprintGeneratedClass` — the runtime class created from a Blueprint
- `Ubergraph` — the visual graph that compiles to Kismet bytecode

### Native C++ Components

Game-specific C++ code lives in compiled DLLs (e.g., `GameName-Win64-Shipping.dll`). This is:
- Closed-source (unless the developer provides source access)
- Contains the "native" implementations that Blueprints call into
- Accessible via reflection — the engine exposes `UCLASS`, `UPROPERTY`, `UFUNCTION` metadata
- Modifiable via DLL injection and hooking (UE4SS approach)

### Component Architecture

UE uses an **Actor-Component model:**
- `AActor` — game object placed in the world
- `UActorComponent` — non-attached behavior/logic
- `USceneComponent` — transform-aware component
- `UPrimitiveComponent` — renderable/collidable component (StaticMesh, SkeletalMesh, etc.)
- `UChildActorComponent` — spawns another actor as a sub-object

---

## 5. Scripting

### Blueprint Scripting

- Visual node-based programming
- Compiled to Kismet bytecode (stored in `.uasset`)
- Interpreted by UE's VM at runtime
- Can be decompiled with tools like KismetAnalyzer, KismetKompiler
- **Limitation:** Cooked Blueprints lose editor-only graph metadata — only bytecode remains

### Unreal Engine C++

- Primary language for game logic
- Uses UE's reflection system (`UCLASS`, `UPROPERTY`, `UFUNCTION`, `USTRUCT`, `UENUM`)
- Compiled with MSVC, produces native DLLs
- Not directly moddable without source access
- Can be hooked via detour/inline hooks on known functions

### Lua via Plugins (Developer-Side)

These are **developer integrations**, not end-user modding tools:

| Plugin | GitHub | UE Support | Key Feature |
|--------|--------|------------|-------------|
| **UnLua** | [Tencent/UnLua](https://github.com/Tencent/UnLua) | 4.17–5.x | Override BlueprintEvents, hot reload, optimized UFUNCTION invoking |
| **slua-unreal** | [Tencent/sluaunreal](https://github.com/Tencent/sluaunreal) | 4.18, 4.26, 5.1 | Blueprint reflection + static code generation + C++ template binding |

**UnLua** is the more actively maintained option. It allows:
- Access all `UCLASS/UPROPERTY/UFUNCTION/USTRUCT/UENUM` from Lua
- Override `BlueprintEvent`, `RepNotify`, `AnimNotify`, `InputEvent`
- Hot-reload Lua without C++ recompilation
- Cross-platform: Windows, Android, iOS, Linux, OSX

### Lua via UE4SS (End-User Modding)

UE4SS provides a **separate** Lua runtime injected into the running game process:
- Write Lua mods based on the live UE object system
- Hook existing UFunctions, read/write properties
- Spawn Blueprint mods without editing game files
- **Limitation:** Cannot create new UFunctions from Lua — only hook existing ones

---

## 6. Modding APIs & Official Support

### Official SDK / DevKit

Some games provide official mod support:
- **Fortnite Creative / UEFN** (Unreal Editor for Fortnite) — official modding via Epic
- **Ark: Survival Evolved** — Steam Workshop + dev kit
- **ARK: Survival Ascended** — mod.io integration
- **MechWarrior 5** — official mod support with documentation

### Epic's Mod.io Integration

Epic Games endorses [mod.io](https://mod.io/) as the standard mod distribution platform. The mod.io SDK integrates with UE4/5 projects and handles:
- Mod upload/download
- Version management
- Multiplayer mod synchronization

### Marketplace / Fab

The [Fab marketplace](https://www.fab.com/) (successor to UE Marketplace) sells plugins, assets, and tools — but primarily for developers, not modders.

---

## 7. Community Frameworks

### UE4SS (Unreal Engine 4/5 Scripting System)

**The most important community modding framework.**

- **GitHub:** [UE4SS-RE/RE-UE4SS](https://github.com/UE4SS-RE/RE-UE4SS) (~2,600 stars)
- **Docs:** [docs.ue4ss.com](https://docs.ue4ss.com/)
- **UE Versions:** 4.12 through 5.7
- **License:** MIT
- **Language:** C++ (97.6%), Lua (1.2%)

**Core Features:**
| Feature | Description |
|---------|-------------|
| Lua Scripting API | Write mods in Lua against the live UE object system |
| Blueprint Modloader | Spawn Blueprint mods without editing/replacing game files |
| C++ Modding API | Write C++ mods against the UE object system |
| Live Property Viewer/Editor | Search, view, edit, watch properties of loaded objects at runtime |
| UHT Dumper | Generate UHT-compatible C++ headers (mirror `.uproject`) |
| C++ Header Dumper | Generate C++ headers with offsets from reflected classes |
| USMAP Dumper | Generate `.usmap` mapping files for unversioned properties |
| UMAP Recreation Dumper | Dump loaded actors to recreate `.umaps` in-editor |
| Universal UE Mods | Unlock console, FPS counter, etc. |

**Installation:** Extract release zip to `{game}/GameName/Binaries/Win64/` (or `ue4ss/` subfolder in newer versions). Only the proxy DLL (`dwmapi.dll`) stays in Win64.

**Build Requirements:**
- MSVC toolset >= 14.43.0 (C++23)
- Rust >= 1.73.0
- CMake >= 3.22
- Ninja or MSVC

**Build Commands:**
```bash
cmake -B build_cmake_Game__Shipping__Win64 -G Ninja -DCMAKE_BUILD_TYPE=Game__Shipping__Win64
cmake --build build_cmake_Game__Shipping__Win64
```

### UCRE (Unreal Engine Console Runner and Enabler)

Community tool for enabling the developer console in shipping builds. Often bundled with or superseded by UE4SS's universal mods.

---

## 8. Analysis & Modding Tools

### Archive/Pak Tools

| Tool | Language | GitHub | Purpose |
|------|----------|--------|---------|
| **FModel** | C# | [4sval/FModel](https://github.com/4sval/FModel) (3,005 stars) | UE archive explorer — browse, preview, export assets. Uses CUE4Parse core |
| **CUE4Parse** | C# | [FabianFG/CUE4Parse](https://github.com/FabianFG/CUE4Parse) | Core parsing library for UE4/5 archives and packages |
| **UnrealPak** | C++ | Epic official | Pack/unpack `.pak` files (bundled with UE source) |
| **repak** | Rust | [trumank/repak](https://github.com/trumank/repak) | Faster alternative to UnrealPak — 2x faster unpacking, supports versions 1–11 |
| **retoc** | Rust | [trumank/retoc](https://github.com/trumank/retoc) | Pack/unpack IO Store containers, convert between Zen and Legacy formats |
| **ZenTools-UE4** | C++ | [WistfulHopes/ZenTools-UE4](https://github.com/WistfulHopes/ZenTools-UE4) | Extract cooked packages from IO Store containers |
| **ZenTools-UE5** | C++ | [Buckminsterfullerene02/UE-Modding-Tools](https://github.com/Buckminsterfullerene02/UE-Modding-Tools) | Extract IO Store packages for UE5 games |
| **UnrealReZen** | C# | [rm-NoobInCoding/UnrealReZen](https://github.com/rm-NoobInCoding/UnrealReZen) | Pack `.utoc`/`.ucas` files for IoStore modding |
| **u4pak** | Python | [panzi/u4pak](https://github.com/panzi/u4pak) | Python pak parser with detailed format documentation |
| **ue4pak-rs** | Rust | [Speedy37/ue4pak-rs](https://github.com/Speedy37/ue4pak-rs) | Rust pak encoder/decoder |

### Asset Inspection & Editing

| Tool | Language | GitHub | Purpose |
|------|----------|--------|---------|
| **UAssetGUI** | C# | Community | GUI for editing `.uasset` properties (hex editing helper) |
| **UAssetEditor** | C# | [ohboundless/UAssetEditor](https://github.com/ohboundless/UAssetEditor) | Programmatic UAsset API — deserialize, modify, reserialize |
| **UModel** | C++ | [gildor.org](https://www.gildor.org/) | Model/animation viewer and exporter (long-standing tool) |
| **UnrealExporter** | C# | [whotookzakum/UnrealExporter](https://github.com/whotookzakum/UnrealExporter) | CLI batch exporter powered by CUE4Parse |

### Blueprint/Kismet Reverse Engineering

| Tool | Language | GitHub | Purpose |
|------|----------|--------|---------|
| **KismetAnalyzer** | C# | [trumank/kismet-analyzer](https://github.com/trumank/kismet-analyzer) (112 stars) | Analyze kismet bytecode, generate CFGs, mod kismet |
| **KismetKompiler** | C# | [tge-was-taken/KismetKompiler](https://github.com/tge-was-taken/KismetKompiler) | Decompile/recompile Blueprints (.kms format) |
| **uasset_read** | Python | [soatori/uasset_read](https://github.com/soatori/uasset_read) | Parse `.uasset` files — extract Blueprint graphs, decompile Kismet bytecode to C++ pseudo-code |
| **BlueprintToCpp** | C# | [Krowe-moh/BlueprintToCpp](https://github.com/Krowe-moh/BlueprintToCpp) | Convert Blueprints to C++ code for reverse engineering |

### SDK Dumpers

| Tool | Language | GitHub | Purpose |
|------|----------|--------|---------|
| **UE-Dumper** | C++ | [McDaived/UE-Dumper](https://github.com/McDaived/UE-Dumper) | Inject into running game, dump full C++ SDK (classes, structs, enums, offsets). Supports UE4 4.20–4.27, UE5 5.0–5.3 |
| **UE4-5-Dumper** | C++ | [MehmetBicerDev/UnrealEngine4-5-Dumper](https://github.com/MehmetBicerDev/UnrealEngine4-5-Dumper) | Auto-updatable SDK dumper |

### Compression & Brotli

- **Brotli:** Used by UE5 for some compressed assets. The Brotli unpacker is integrated into tools like CUE4Parse and FModel.
- **Oodle:** Primary compression in UE5 IO Store. Supported by repak, retoc, and CUE4Parse.
- **Zlib:** Legacy compression, universally supported.

### GVAS Parser

GVAS (GameSave) format is used by UE4/5 save games (particularly games using the `SaveGame` system). Parsers exist in:
- [trumank/uesave](https://github.com/trumank/uesave) — Rust-based GVAS parser
- Community tools integrated into FModel for save game inspection

---

## 9. Key Differences Between UE4 and UE5 for Modders

| Aspect | UE4 | UE5 |
|--------|-----|-----|
| **Archive format** | `.pak` only (default) | `.pak` + IO Store (`.ucas`/`.utoc`) |
| **Asset versioning** | Versioned (custom version tags in headers) | **Unversioned** by default (cooked data) |
| **Modding accessibility** | Easier — versioned data is more tolerant | Harder — any class layout change breaks mods |
| **FVector precision** | `float` (12 bytes) | `double` (24 bytes) — breaks binary compat |
| **Asset editing** | Straightforward with versioned headers | Requires `.usmap` mappings for unversioned assets |
| **Pak signing** | Rare | More common |
| **Encryption** | Optional | More common |
| **IO Store packing** | N/A | Requires retoc/UnrealReZen/ZenTools |
| **Blueprint nativization** | Optional | Still optional but more aggressively used |
| **Shader complexity** | Simpler (SM5) | SM6 required for Nanite/Lumen |
| **Tool maturity** | Mature ecosystem | Tools catching up (retoc, CUE4Parse, FModel all support UE5) |

**Bottom line for modders:** UE5 games are harder to mod because:
1. Unversioned assets require `.usmap` mapping files to parse
2. IO Store containers require specialized tools
3. Any game update can change class layouts, breaking existing mods
4. More games ship with encryption and signing enabled

---

## 10. Open Source Projects Worth Studying

### Essential Reading

| Project | URL | Why Study It |
|---------|-----|-------------|
| **Buckminsterfullerene02 UE Modding Guide** | [buckminsterfullerene02.github.io/dev-guide](https://buckminsterfullerene02.github.io/dev-guide/) | The definitive guide to UE modding — covers everything from basics to advanced |
| **UE4SS Documentation** | [docs.ue4ss.com](https://docs.ue4ss.com/) | How the primary modding framework works internally |
| **Windrose Modding Toolkit** | [UberMorgott/Windrose-Modding-Toolkit](https://github.com/UberMorgott/Windrose-Modding-Toolkit) | Complete RE workflow for a real UE5.6.1 game — SDK dumps, Ghidra scripts, pak LogicMods |
| **Dmgvol/UE_Modding** | [Dmgvol/UE_Modding](https://github.com/Dmgvol/UE_Modding) | Step-by-step modding guides — IoStore extraction, UAssetGUI, hex editing |

### Core Libraries

| Project | URL | Stars | Purpose |
|---------|-----|-------|---------|
| **CUE4Parse** | [FabianFG/CUE4Parse](https://github.com/FabianFG/CUE4Parse) | — | The parsing engine behind FModel; study for understanding UE archive internals |
| **FModel** | [4sval/FModel](https://github.com/4sval/FModel) | 3,005 | Reference implementation of UE asset exploration |
| **repak** | [trumank/repak](https://github.com/trumank/repak) | — | Clean Rust implementation of pak reading/writing |
| **retoc** | [trumank/retoc](https://github.com/trumank/retoc) | — | IO Store container handling — understand Zen format |
| **kismet-analyzer** | [trumank/kismet-analyzer](https://github.com/trumank/kismet-analyzer) | 112 | Kismet bytecode analysis and CFG generation |
| **KismetKompiler** | [tge-was-taken/KismetKompiler](https://github.com/tge-was-taken/KismetKompiler) | — | Blueprint decompilation and recompilation |
| **uasset_read** | [soatori/uasset_read](https://github.com/soatori/uasset_read) | — | Python Blueprint parser — great for understanding `.uasset` internal structure |

### Game-Specific Modding Projects

| Project | URL | Game |
|---------|-----|------|
| **ShareShip** | [uberMorgott/ShareShip](https://github.com/uberMorgott/ShareShip) | Windrose/UE5.6.1 |
| **Borderlands 3 Modding Wiki** | [BLCM/BLCMods](https://github.com/BLCM/BLCMods/wiki) | Borderlands 3 (UE4.26) |
| **DRG Modding Handbook** | [drg-modding.github.io](https://drg-modding.github.io/docs/guides/blueprint-modding-guide.html) | Deep Rock Galactic |

---

## 11. Typical Modding Workflow

### Phase 1: Reconnaissance

1. **Identify engine version** — Right-click the game binary → Details tab → UE version
2. **Identify archive format** — Check `Content/Paks/` for `.pak` only or `.ucas`/`.utoc`
3. **Check for encryption** — Try opening paks; if AES-encrypted, find keys (game binary, config files, community databases)
4. **Open with FModel** — Load game directory, browse asset tree, identify interesting assets
5. **Dump SDK** — If runtime analysis needed, inject UE4SS or UE-Dumper to get class/offset information
6. **Generate .usmap** — For UE5 unversioned games, dump property mappings with UE4SS

### Phase 2: Asset Analysis

1. **Export target assets** — Use FModel/CUE4Parse to export `.uasset` files
2. **Analyze with UAssetGUI** — View properties, understand structure
3. **Analyze Blueprints** — Use KismetAnalyzer for CFG graphs, uasset_read for decompilation
4. **Identify values to change** — Damage numbers, spawn rates, UI strings, etc.

### Phase 3: Modification

**For simple value edits:**
1. Extract `.uasset` from game paks
2. Open in UAssetGUI or hex editor
3. Modify target values (strings, floats, bools, object references)
4. Save modified `.uasset`

**For Blueprint mods:**
1. Use UE4SS Blueprint Modloader to spawn new Blueprint actors
2. Or create pak-based Blueprint overrides

**For runtime mods:**
1. Write UE4SS Lua scripts to hook functions
2. Or write UE4SS C++ mods for deeper integration

### Phase 4: Packaging

**For .pak mods:**
1. Create folder structure matching the original mount point (e.g., `Game/Content/...`)
2. Place modified `.uasset` + `.uexp` files
3. Pack with UnrealPak or repak
4. Copy `.sig` file if game uses pak signing
5. Place in `~mods/` directory

**For IO Store mods (UE5):**
1. Use `retoc to-legacy` to convert IO Store assets to editable format
2. Edit with UAssetGUI
3. Use `retoc to-zen` or `UnrealReZen` to convert back to IO Store format
4. Place patch `.utoc`/`.ucas`/`.pak` in game's `Paks/` directory

**For UE4SS Lua mods:**
1. Write `.lua` script following UE4SS API
2. Place in `ue4ss/mods/` directory
3. Configure `mods.txt` to enable the mod

### Phase 5: Testing & Distribution

1. Launch game and verify mod loads
2. Test with other mods for conflicts
3. Distribute via Nexus Mods, Mod.io, or game-specific platforms

---

## 12. Comparison: Unreal vs Unity vs Godot for Modding

### Why Unreal is Easier for Modding

| Advantage | Details |
|-----------|---------|
| **Source-available** | Engine source is readable — anyone can reverse-engineer serialization formats |
| **Consistent architecture** | All UE games use the same `UObject` system, `ProcessEvent`, reflection — tools work across hundreds of games |
| **Mature tool ecosystem** | FModel, UE4SS, CUE4Parse, repak — battle-tested across thousands of games |
| **Pak file transparency** | `.pak` format is well-documented, easy to unpack/repack |
| **Blueprint reflection** | Even without source, the engine exposes class/property/function metadata at runtime |
| **Console variable access** | Many games expose `CVar` settings that can be toggled |
| **Consistent mod loading** | Engine loads all `.pak` files in directory — no custom mod framework needed for basic mods |

### Why Unreal is Harder for Modding

| Disadvantage | Details |
|--------------|---------|
| **Cooked assets** | Assets can't be loaded back into the editor — only runtime editing or specialized tools |
| **UE5 unversioned cooking** | Removes parsing metadata — requires `.usmap` files |
| **IO Store complexity** | New container format requires specialized tools |
| **Anti-cheat** | Many UE5 games (especially multiplayer) ship with anti-cheat that blocks DLL injection |
| **Encryption/signing** | Increasingly common, requires key extraction |
| **Large binaries** | Games are 50–100GB+, making full extraction slow |
| **No standard mod API** | Unlike Minecraft/Valve games, UE has no built-in modding interface — all tools are community-created |

### Compared to Unity

| Aspect | UE | Unity |
|--------|----|-------|
| **Modding ecosystem** | Large, mature, many cross-game tools | Fragmented, game-specific |
| **Asset format** | Well-documented `.pak`/`.uasset` | `.assets`/`.bundle` (less documented) |
| **Runtime injection** | UE4SS makes it standardized | Requires MonoMod/Harmony or similar |
| **Visual scripting** | Blueprints (decompilable from bytecode) | Bolt (rarely shipped in games) |
| **Source access** | Engine source available | Engine source available |
| **Community tools** | FModel, UE4SS (cross-game) | Game-specific tools dominate |

### Compared to Godot

| Aspect | UE | Godot |
|--------|----|-------|
| **Source access** | Source-available | Fully open source (MIT) |
| **Game binary size** | Large (50–100GB) | Small (typically <1GB) |
| **Tool maturity** | Very mature | Early stage — tools are emerging |
| **Game count** | Thousands of moddable games | Growing but smaller ecosystem |
| **Serialization** | Complex, versioned | Simpler, `.tres`/`.scn` are text or simple binary |
| **Modding difficulty** | Medium (tools exist but complex) | Potentially easier (open source, simple formats) but fewer games |

---

## Appendix A: Tool Quick Reference

### Essential Tools (Install These First)

| Tool | Purpose | Download |
|------|---------|----------|
| **FModel** | Browse & export game assets | [fmodel.app/download](https://fmodel.app/download) |
| **UE4SS** | Runtime Lua scripting, SDK dumps | [GitHub Releases](https://github.com/UE4SS-RE/RE-UE4SS/releases) |
| **UnrealPak** | Pack/unpack `.pak` files | Bundled with UE source |
| **repak** | Faster pak operations | [trumank/repak](https://github.com/trumank/repak) |
| **retoc** | IO Store pack/unpack/convert | [trumank/retoc](https://github.com/trumank/retoc) |
| **UAssetGUI** | Edit `.uasset` properties | Community tool |
| **7-Zip** | Extract some archive formats | [7-zip.org](https://7-zip.org) |

### Finding AES Keys

- Check `crypto.json` files in game directory
- Search game binary for AES key patterns
- Community databases (e.g., [pcgamingwiki.com](https://www.pcgamingwiki.com))
- Use tools like `AES-Key-Finder` on game binaries

### Common UE4SS Launch Arguments

- `--ue4ss-path <path>` — Custom UE4SS.dll location
- `--no-ue4ss` — Disable UE4SS temporarily
- `UE4SS_MODS_PATHS="path1;path2"` — Additional mod directories

---

## Appendix B: Key GitHub Repositories

| Repository | URL | Description |
|-----------|-----|-------------|
| UE4SS-RE/RE-UE4SS | https://github.com/UE4SS-RE/RE-UE4SS | Primary modding framework |
| 4sval/FModel | https://github.com/4sval/FModel | Archive explorer (3K stars) |
| FabianFG/CUE4Parse | https://github.com/FabianFG/CUE4Parse | Core parsing library |
| trumank/repak | https://github.com/trumank/repak | Rust pak tool |
| trumank/retoc | https://github.com/trumank/retoc | IO Store tool |
| trumank/kismet-analyzer | https://github.com/trumank/kismet-analyzer | Blueprint analysis |
| tge-was-taken/KismetKompiler | https://github.com/tge-was-taken/KismetKompiler | Blueprint decompiler/compiler |
| soatori/uasset_read | https://github.com/soatori/uasset_read | Python .uasset parser |
| McDaived/UE-Dumper | https://github.com/McDaived/UE-Dumper | Runtime SDK dumper |
| WistfulHopes/ZenTools-UE4 | https://github.com/WistfulHopes/ZenTools-UE4 | IO Store extraction (UE4) |
| rm-NoobInCoding/UnrealReZen | https://github.com/rm-NoobInCoding/UnrealReZen | IO Store packing |
| ohboundless/UAssetEditor | https://github.com/ohboundless/UAssetEditor | UAsset read/write API |
| UberMorgott/Windrose-Modding-Toolkit | https://github.com/UberMorgott/Windrose-Modding-Toolkit | Complete RE workflow example |
| Dmgvol/UE_Modding | https://github.com/Dmgvol/UE_Modding | Step-by-step modding guides |
| panzi/u4pak | https://github.com/panzi/u4pak | Python pak parser (detailed format docs) |
| Speedy37/ue4pak-rs | https://github.com/Speedy37/ue4pak-rs | Rust pak encoder/decoder |
| Tencent/UnLua | https://github.com/Tencent/UnLua | Lua plugin for UE |
| Tencent/sluaunreal | https://github.com/Tencent/sluaunreal | Lua plugin for UE (slua) |
| Krowe-moh/BlueprintToCpp | https://github.com/Krowe-moh/BlueprintToCpp | Blueprint → C++ converter |
| protospatial/NodeToCode | https://github.com/protospatial/NodeToCode | LLM-powered Blueprint → C++ |

---

*Document compiled August 2026. Tool versions and URLs verified at time of research.*
