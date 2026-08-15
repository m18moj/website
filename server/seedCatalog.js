// One-time seed data for the packs/scripts tables (see server/db.js) — used
// only on first boot when those tables are empty. After that, the database
// is the source of truth and this file is never read again.
const SEED_CATALOG = [
  {
    "packId": "apex",
    "packName": "Apex Legends Pack",
    "gameTitle": "Apex Legends",
    "scripts": [
      {
        "id": "movement-controller",
        "title": "Slide-Hop Momentum Chain",
        "price": 3,
        "description": "Chains slides, jumps, and wall-bounces into a fluid momentum system with speed decay and stamina cost.",
        "category": "Movement"
      },
      {
        "id": "ability-cast-system",
        "title": "Legend Ability Framework",
        "price": 3,
        "description": "Tactical, passive, and ultimate ability data per legend, including charge rate, cooldown reduction, and interrupt rules.",
        "category": "Abilities"
      },
      {
        "id": "loot-pickup-manager",
        "title": "Death Box & Loot Roll System",
        "price": 3,
        "description": "Death box spawning, loot table rolls by rarity, and auto-stack pickup with radial ping support.",
        "category": "Loot"
      },
      {
        "id": "squad-sync-logic",
        "title": "Squad Ping & Comms Wheel",
        "price": 3,
        "description": "Context-aware ping wheel, squad status sync, and enemy-spotted callouts without voice chat.",
        "category": "Squad"
      },
      {
        "id": "zone-collapse-system",
        "title": "Ring Collapse & Damage Curve",
        "price": 3,
        "description": "Shrinking ring phases with escalating tick damage, warning telegraphs, and next-zone prediction.",
        "category": "World"
      },
      {
        "id": "respawn-knockdown-flow",
        "title": "Knockdown & Respawn Beacon",
        "price": 3,
        "description": "Bleed-out timers, self-revive items, and squad respawn beacons that drop teammates back into the fight.",
        "category": "Systems"
      },
      {
        "id": "armor-health-layer",
        "title": "Armor Tier & Shield Swap",
        "price": 3,
        "description": "Layered health/armor pools across four shield tiers with break effects and evo-shield style upgrades.",
        "category": "Combat"
      },
      {
        "id": "character-role-framework",
        "title": "Legend Perk & Passive Tree",
        "price": 2,
        "description": "Class-based passive perks (recon, support, assault) with unlockable perk tiers per legend.",
        "category": "Progression"
      },
      {
        "id": "match-feed-hud",
        "title": "Kill Feed & Squad Elims HUD",
        "price": 2,
        "description": "Live kill feed, squads-remaining counter, and elimination assist tracking for the match overlay.",
        "category": "HUD"
      },
      {
        "id": "ranked-progression",
        "title": "Ranked Ladder & RP Calculator",
        "price": 2,
        "description": "Placement-based RP gain/loss curves, tier demotion protection, and season-reset scaling.",
        "category": "Progression"
      }
    ],
    "genre": "shooter",
    "chip": "Hero Shooter",
    "splash": "apex",
    "dataGame": "APEX",
    "description": "Movement, abilities, loot pickups, squads, and battle royale pacing loops.",
    "detailUrl": "games/game-apex-legends"
  },
  {
    "packId": "call-of-duty",
    "packName": "Call of Duty Pack",
    "gameTitle": "Call of Duty",
    "scripts": [
      {
        "id": "weapon-loadout-manager",
        "title": "Custom Loadout & Gunsmith",
        "price": 4,
        "description": "Attachment slots, weapon blueprints, and loadout save slots with stat-altering attachment trees.",
        "category": "Weapons"
      },
      {
        "id": "killstreak-controller",
        "title": "Killstreak & Scorestreak Chain",
        "price": 3,
        "description": "Streak thresholds, care package drops, and streak-loss-on-death rules for kill and score-based streaks.",
        "category": "Streaks"
      },
      {
        "id": "objective-capture-flow",
        "title": "Objective Capture & Control",
        "price": 3,
        "description": "Domination-style point capture with contest states, capture speed scaling, and team-count multipliers.",
        "category": "Objective"
      },
      {
        "id": "score-event-tracker",
        "title": "Combat Score Event Log",
        "price": 3,
        "description": "Per-action score events (kills, assists, objective plays) feeding a live combat log and end-match summary.",
        "category": "Systems"
      },
      {
        "id": "grenade-utility-system",
        "title": "Lethal & Tactical Equipment",
        "price": 3,
        "description": "Cook timers, bounce physics, and effect zones for frags, flashes, smokes, and stun equipment.",
        "category": "Equipment"
      },
      {
        "id": "multiplayer-spawn-logic",
        "title": "Dynamic Spawn Safety System",
        "price": 3,
        "description": "Spawn-point scoring that avoids enemy sightlines and recent death clusters to reduce spawn-kills.",
        "category": "Systems"
      },
      {
        "id": "hit-feedback-damage",
        "title": "Hit Marker & Damage Numbers",
        "price": 3,
        "description": "Directional hit markers, headshot cues, and floating damage numbers synced to weapon damage falloff.",
        "category": "Feedback"
      },
      {
        "id": "tactical-perk-system",
        "title": "Perk Package Builder",
        "price": 3,
        "description": "Three-tier perk package system (movement, stealth, gunplay) with conflicting-perk validation.",
        "category": "Progression"
      },
      {
        "id": "mission-objective-hud",
        "title": "Objective Marker & Compass HUD",
        "price": 3,
        "description": "Waypoint markers, compass bearings, and objective status ticks for both MP and campaign-style modes.",
        "category": "HUD"
      },
      {
        "id": "match-end-summary",
        "title": "End-of-Match Scorecard",
        "price": 3,
        "description": "Post-match XP breakdown, MVP highlight selection, and challenge-progress summary screen.",
        "category": "Systems"
      }
    ],
    "genre": "shooter",
    "chip": "Modern Warfare",
    "splash": "cod",
    "dataGame": "COD",
    "description": "Killstreaks, weapon handling, score events, and objective-based flow.",
    "detailUrl": "games/game-call-of-duty"
  },
  {
    "packId": "fortnite",
    "packName": "Fortnite Pack",
    "gameTitle": "Fortnite",
    "scripts": [
      {
        "id": "build-assist-controller",
        "title": "Build Edit & Piece Snap System",
        "price": 3,
        "description": "Wall/floor/ramp placement with edit confirm, 90-degree turns, and piece-swap while under fire.",
        "category": "Building"
      },
      {
        "id": "loot-rarity-engine",
        "title": "Loot Pool & Rarity Weighting",
        "price": 3,
        "description": "Chest and floor-loot spawn tables weighted by rarity with vaulted-item exclusion support.",
        "category": "Loot"
      },
      {
        "id": "shield-regen-circuit",
        "title": "Shield Potion & Regen Logic",
        "price": 2,
        "description": "Shield item stacking, overshield caps, and consumption animations for potions and mini-shields.",
        "category": "Systems"
      },
      {
        "id": "storm-pressure-logic",
        "title": "Storm Circle & Damage Ticks",
        "price": 3,
        "description": "Shrinking storm phases, safe-zone pathing hints, and ramping tick damage per phase.",
        "category": "World"
      },
      {
        "id": "combat-flow-manager",
        "title": "Third-Person Combat Loop",
        "price": 3,
        "description": "Aim-down-sights blend, weapon-swap timing, and fall-damage-on-landing combat feel.",
        "category": "Combat"
      },
      {
        "id": "squad-ping-system",
        "title": "Squad Marker & Loot Ping",
        "price": 2,
        "description": "Context pings for enemies, loot, and rally points visible through structures to squadmates.",
        "category": "Squad"
      },
      {
        "id": "crosshair-aim-assist",
        "title": "Controller Aim Assist Curve",
        "price": 2,
        "description": "Bloom-aware aim assist with slowdown-on-target and rotational assist tuned per weapon class.",
        "category": "Combat"
      },
      {
        "id": "boogie-bounce-controller",
        "title": "Emote & Bounce Pad System",
        "price": 2,
        "description": "Emote wheel playback plus launch-pad and bounce-pad physics with fall-damage negation.",
        "category": "Movement"
      },
      {
        "id": "match-feed-hud",
        "title": "Eliminations & Storm HUD",
        "price": 2,
        "description": "Live elimination feed, players-remaining counter, and storm-timer overlay.",
        "category": "HUD"
      },
      {
        "id": "progression-save-state",
        "title": "Battle Pass Progression Save",
        "price": 2,
        "description": "XP curve, level-up rewards, and battle-pass tier persistence across sessions.",
        "category": "Progression"
      }
    ],
    "genre": "battle-royale",
    "chip": "Battle Royale",
    "splash": "neon",
    "dataGame": "FORTNITE",
    "description": "Building controls, loot logic, combat flow, shields, and progression loops.",
    "detailUrl": "games/game-fortnite"
  },
  {
    "packId": "gta-v",
    "packName": "GTA V Pack",
    "gameTitle": "GTA V",
    "scripts": [
      {
        "id": "driving-controller",
        "title": "Vehicle Handling & Damage Model",
        "price": 4,
        "description": "Grip-based handling per vehicle class with crumple damage, tire blowouts, and engine failure states.",
        "category": "Vehicles"
      },
      {
        "id": "mission-event-trigger",
        "title": "Mission Trigger & Checkpoint Flow",
        "price": 3,
        "description": "Scripted mission beats, checkpoint respawns, and branching objective triggers by zone entry.",
        "category": "Missions"
      },
      {
        "id": "police-chase-system",
        "title": "Wanted Chase & Roadblock AI",
        "price": 4,
        "description": "Escalating pursuit units, spike strips, and roadblock spawning tied to wanted level.",
        "category": "AI"
      },
      {
        "id": "npc-traffic-ai",
        "title": "Pedestrian & Traffic AI",
        "price": 3,
        "description": "Lane-following traffic AI, pedestrian pathing, and reaction behavior — flee, call police, or panic.",
        "category": "AI"
      },
      {
        "id": "wanted-level-manager",
        "title": "Wanted Level & Heat Decay",
        "price": 3,
        "description": "Star-rating heat system with line-of-sight loss, hideout cooldown, and bribe/heat-reduction items.",
        "category": "Systems"
      },
      {
        "id": "heist-preparation-flow",
        "title": "Heist Setup & Crew Payout",
        "price": 4,
        "description": "Multi-stage heist prep missions, crew-cut payout splits, and approach-choice branching.",
        "category": "Missions"
      },
      {
        "id": "economy-property-system",
        "title": "Property Ownership & Income",
        "price": 3,
        "description": "Purchasable properties, passive income ticks, and garage/vehicle storage per owned property.",
        "category": "Economy"
      },
      {
        "id": "character-interaction-system",
        "title": "NPC Dialogue & Relationship",
        "price": 3,
        "description": "Branching NPC conversations with relationship-level gating and context-sensitive interaction prompts.",
        "category": "Dialogue"
      },
      {
        "id": "weapon-combat-controller",
        "title": "Cover-Based Combat System",
        "price": 4,
        "description": "Cover snapping, blind-fire, and lock-on-assist combat loop for third-person gunfights.",
        "category": "Combat"
      },
      {
        "id": "save-progression-state",
        "title": "Save Slot & World State",
        "price": 3,
        "description": "Full save/load of player stats, owned assets, and world-state flags like completed missions and unlocks.",
        "category": "Systems"
      }
    ],
    "genre": "open-world",
    "chip": "Open World",
    "splash": "gta",
    "dataGame": "GTA V",
    "description": "Driving, missions, police chase logic, NPC behavior, and activity loops.",
    "detailUrl": "games/game-gta-v"
  },
  {
    "packId": "minecraft",
    "packName": "Minecraft Pack",
    "gameTitle": "Minecraft",
    "scripts": [
      {
        "id": "sword-combo-controller",
        "title": "Melee Combo & Critical Hits",
        "price": 3,
        "description": "Chained melee combos, sprint-critical hits, and knockback tuning for close-range combat.",
        "category": "Combat"
      },
      {
        "id": "mana-and-stamina-system",
        "title": "Stamina & Hunger Bar System",
        "price": 3,
        "description": "Action-based stamina drain — sprinting, mining, jumping — with regen tied to hunger and rest state.",
        "category": "Systems"
      },
      {
        "id": "enemy-aggro-ai",
        "title": "Mob Aggro & Pathfinding AI",
        "price": 3,
        "description": "Line-of-sight aggro range, pack-hunting behavior, and A*-style pathfinding around terrain.",
        "category": "AI"
      },
      {
        "id": "loot-drop-manager",
        "title": "Block & Mob Drop Tables",
        "price": 3,
        "description": "Weighted drop tables for block breaks and mob kills, with fortune/looting-style multipliers.",
        "category": "Loot"
      },
      {
        "id": "skill-tree-progression",
        "title": "Tool & Enchant Progression",
        "price": 3,
        "description": "Tiered tool upgrades and an enchantment-style skill tree gated by XP levels.",
        "category": "Progression"
      },
      {
        "id": "quest-objective-tracker",
        "title": "Advancement & Quest Tracker",
        "price": 3,
        "description": "Achievement-style advancement tree with hidden and visible quests plus multi-step objective chains.",
        "category": "Quests"
      },
      {
        "id": "inventory-equipment",
        "title": "Inventory, Hotbar & Crafting Grid",
        "price": 3,
        "description": "Stackable inventory, drag-drop hotbar, and a 3x3 crafting grid with shaped-recipe matching.",
        "category": "Inventory"
      },
      {
        "id": "dialogue-branch-system",
        "title": "Villager Trade & Dialogue",
        "price": 3,
        "description": "Branching villager dialogue with trade-offer rotation and reputation-based price scaling.",
        "category": "Dialogue"
      },
      {
        "id": "camera-follow-controller",
        "title": "Third-Person Camera Rig",
        "price": 2,
        "description": "Smooth follow camera with collision avoidance, shoulder-swap, and first/third-person toggle.",
        "category": "Camera"
      },
      {
        "id": "save-load-profile",
        "title": "World Save & Chunk Persistence",
        "price": 3,
        "description": "Per-world save slots with chunk-based persistence for placed blocks and container contents.",
        "category": "Systems"
      }
    ],
    "genre": "sandbox",
    "chip": "Sandbox",
    "splash": "arcane",
    "dataGame": "MINECRAFT",
    "description": "Mining, crafting, survival loops, world generation, and resource systems.",
    "detailUrl": "games/game-minecraft"
  },
  {
    "packId": "pubg",
    "packName": "PUBG Pack",
    "gameTitle": "PUBG",
    "scripts": [
      {
        "id": "zone-collapse-system",
        "title": "Blue Zone Shrink & Damage",
        "price": 3,
        "description": "Phased play-zone shrinking with damage-per-second scaling and a next-zone telegraph circle.",
        "category": "World"
      },
      {
        "id": "loot-spawn-manager",
        "title": "Loot Spawn & Airdrop Tables",
        "price": 3,
        "description": "Building and airdrop loot tables weighted by tier, with hot-drop location weighting.",
        "category": "Loot"
      },
      {
        "id": "squad-communication",
        "title": "Squad Markers & Ping System",
        "price": 3,
        "description": "Map-based squad markers, danger pings, and revive-request callouts visible to the whole team.",
        "category": "Squad"
      },
      {
        "id": "weapon-handling",
        "title": "Recoil Pattern & Attachment System",
        "price": 3,
        "description": "Per-weapon recoil patterns modified by attachments — grips, muzzles, stocks — and stance.",
        "category": "Weapons"
      },
      {
        "id": "health-armor-recovery",
        "title": "Bandage, Boost & Armor Tiers",
        "price": 3,
        "description": "Healing-item timers, boost-item adrenaline effects, and three-tier armor/helmet durability.",
        "category": "Systems"
      },
      {
        "id": "vehicle-system",
        "title": "Vehicle Physics & Fuel System",
        "price": 3,
        "description": "Terrain-based vehicle physics, fuel consumption, and horn/honk noise-aggro for nearby players.",
        "category": "Vehicles"
      },
      {
        "id": "match-feed-system",
        "title": "Kill Feed & Alive-Count HUD",
        "price": 3,
        "description": "Elimination feed, players/teams-alive counter, and spectator-cam target cycling on death.",
        "category": "HUD"
      },
      {
        "id": "enemy-awareness-ai",
        "title": "Bot Awareness & Cover AI",
        "price": 3,
        "description": "Sound-based awareness radius, cover-seeking behavior, and peek-and-fire AI for fill bots.",
        "category": "AI"
      },
      {
        "id": "supply-drop-events",
        "title": "Airdrop Flare & Loot Crate",
        "price": 3,
        "description": "Flare-triggered supply plane routing, crate parachute physics, and a high-tier loot table on open.",
        "category": "Events"
      },
      {
        "id": "match-summary-screen",
        "title": "Chicken Dinner Summary Screen",
        "price": 3,
        "description": "Placement rank, damage-dealt stats, and survival-time summary shown at match end.",
        "category": "Systems"
      }
    ],
    "genre": "battle-royale",
    "chip": "Survival Shooter",
    "splash": "pubg",
    "dataGame": "PUBG",
    "description": "Safe-zone logic, loot flow, weapons, squad systems, and survival pressure.",
    "detailUrl": "games/game-pubg"
  },
  {
    "packId": "roblox",
    "packName": "Roblox Pack",
    "gameTitle": "Roblox",
    "scripts": [
      {
        "id": "resource-gathering",
        "title": "Tool-Based Resource Nodes",
        "price": 3,
        "description": "ProximityPrompt-triggered resource nodes (trees, rocks, ore) with respawn timers and tool-tier gating.",
        "category": "Gameplay"
      },
      {
        "id": "hunger-thirst-system",
        "title": "Leaderstats & Currency System",
        "price": 3,
        "description": "IntValue leaderstats for coins and XP with DataStore-backed saving and a stat-change event bus.",
        "category": "Systems"
      },
      {
        "id": "weather-cycle",
        "title": "Day-Night Cycle & Lighting",
        "price": 2,
        "description": "TweenService-driven Lighting property cycling for a smooth in-game day/night loop.",
        "category": "World"
      },
      {
        "id": "base-building-placement",
        "title": "Tycoon Building & Purchase System",
        "price": 4,
        "description": "Classic Roblox tycoon droppers, conveyors, and button-purchase upgrades gated by cash.",
        "category": "Tycoon"
      },
      {
        "id": "crafting-system",
        "title": "Gamepass & Dev Product Shop",
        "price": 4,
        "description": "MarketplaceService-integrated gamepass and developer-product purchase flow with receipt handling.",
        "category": "Monetization"
      },
      {
        "id": "enemy-night-patrol-ai",
        "title": "NPC Patrol & Humanoid AI",
        "price": 3,
        "description": "Humanoid:MoveTo patrol routes, PathfindingService chase logic, and simple attack-cooldown AI.",
        "category": "AI"
      },
      {
        "id": "event-trigger-manager",
        "title": "Round-Based Minigame Manager",
        "price": 4,
        "description": "Lobby-to-round state machine for round-based minigames, with intermission timers and team balancing.",
        "category": "Systems"
      },
      {
        "id": "inventory-storage",
        "title": "RemoteEvent Inventory Sync",
        "price": 3,
        "description": "Server-authoritative inventory with RemoteEvent-synced UI and exploit-resistant item validation.",
        "category": "Inventory"
      },
      {
        "id": "progression-unlocks",
        "title": "Obby Checkpoint & Stage System",
        "price": 3,
        "description": "Checkpoint-touch save points, stage progression, and leaderboard-tracked completion times for obbies.",
        "category": "Progression"
      },
      {
        "id": "auto-save-recovery",
        "title": "DataStore Auto-Save & Backup",
        "price": 3,
        "description": "Scheduled DataStoreService saves with retry-on-fail, session-locking, and BindToClose data protection.",
        "category": "Systems"
      }
    ],
    "genre": "creator",
    "chip": "Creator Platform",
    "splash": "ruin",
    "dataGame": "ROBLOX",
    "description": "Quests, leaderboards, economy, social systems, and tycoon gameplay loops.",
    "detailUrl": "games/game-roblox"
  },
  {
    "packId": "skyrim",
    "packName": "Skyrim Pack",
    "gameTitle": "Skyrim",
    "scripts": [
      {
        "id": "quest-state-manager",
        "title": "Quest Stage & Journal System",
        "price": 3,
        "description": "Multi-stage quest tracking with journal entries, stage-completion triggers, and quest-log UI hooks.",
        "category": "Quests"
      },
      {
        "id": "skill-tree-system",
        "title": "Perk Tree & Skill Leveling",
        "price": 3,
        "description": "Skill-use-based leveling (learn by doing) feeding into a branching perk tree with prerequisite gating.",
        "category": "Progression"
      },
      {
        "id": "loot-rarity-engine",
        "title": "Loot Tables & Enchanted Drops",
        "price": 3,
        "description": "Level-scaled loot tables with rarity tiers and randomized enchantment rolls on weapon/armor drops.",
        "category": "Loot"
      },
      {
        "id": "dialogue-branch-system",
        "title": "Branching Dialogue & Persuasion",
        "price": 3,
        "description": "Tree-based NPC dialogue with persuasion and intimidate skill checks gating certain branches.",
        "category": "Dialogue"
      },
      {
        "id": "world-event-manager",
        "title": "Radiant World Events",
        "price": 3,
        "description": "Randomized ambient world events — bandit attacks, traveling merchants, dragon sightings — on a timer.",
        "category": "World"
      },
      {
        "id": "inventory-equipment",
        "title": "Equipment Slots & Weight System",
        "price": 3,
        "description": "Armor and weapon equip slots with carry-weight limits and encumbrance-based movement penalties.",
        "category": "Inventory"
      },
      {
        "id": "faction-reputation-logic",
        "title": "Faction Standing & Bounty System",
        "price": 2,
        "description": "Per-faction reputation tracking with bounty accrual, guard hostility, and faction-quest gating.",
        "category": "Systems"
      },
      {
        "id": "travel-fast-travel",
        "title": "Fast Travel & Map Discovery",
        "price": 2,
        "description": "Discoverable map markers unlocking fast-travel points, with random-encounter chance on route.",
        "category": "World"
      },
      {
        "id": "crafting-smithing",
        "title": "Smithing & Alchemy Crafting",
        "price": 3,
        "description": "Material-based smithing upgrades and potion-brewing alchemy with ingredient-effect discovery.",
        "category": "Crafting"
      },
      {
        "id": "save-character-state",
        "title": "Character Save & Build State",
        "price": 3,
        "description": "Full character-state save — stats, perks, inventory, quest flags — across multiple save slots.",
        "category": "Systems"
      }
    ],
    "genre": "rpg",
    "chip": "Fantasy RPG",
    "splash": "skyrim",
    "dataGame": "SKYRIM",
    "description": "Quests, perk progression, loot loops, world events, and RPG systems.",
    "detailUrl": "games/game-skyrim"
  },
  {
    "packId": "valorant",
    "packName": "Valorant Pack",
    "gameTitle": "Valorant",
    "scripts": [
      {
        "id": "weapon-recoil-system",
        "title": "Weapon Recoil & Spray Pattern",
        "price": 3,
        "description": "Per-weapon spray-pattern recoil with reset timers and first-bullet-accuracy modeling.",
        "category": "Weapons"
      },
      {
        "id": "ability-cooldowns",
        "title": "Agent Ability Charge System",
        "price": 3,
        "description": "Charge-based ability economy — signature abilities free, others bought — with ultimate-point accrual.",
        "category": "Abilities"
      },
      {
        "id": "buy-phase-manager",
        "title": "Buy Phase & Economy System",
        "price": 3,
        "description": "Round-start buy menu with credit rewards, loss-bonus economy, and per-side loadout saving.",
        "category": "Economy"
      },
      {
        "id": "round-timer-controller",
        "title": "Round Timer & Spike Phases",
        "price": 3,
        "description": "Round clock, plant/defuse phase timers, and overtime sudden-death round handling.",
        "category": "Systems"
      },
      {
        "id": "ability-hit-detection",
        "title": "Ability Hit Reg & Status Effects",
        "price": 3,
        "description": "Hitbox-accurate ability collision with status effects — blind, slow, vulnerable — and duration stacking.",
        "category": "Combat"
      },
      {
        "id": "spatial-audio-caller",
        "title": "Positional Audio & Footstep Callouts",
        "price": 2,
        "description": "3D positional audio for footsteps and abilities, feeding an auto-callout system for enemy direction.",
        "category": "Audio"
      },
      {
        "id": "scoreboard-round-stats",
        "title": "Scoreboard & Combat Score",
        "price": 2,
        "description": "Live scoreboard with combat score, first-bloods, and clutch tracking per round.",
        "category": "HUD"
      },
      {
        "id": "agent-role-system",
        "title": "Agent Role & Kit Framework",
        "price": 2,
        "description": "Duelist, controller, initiator, and sentinel role framework defining each agent's ability kit and playstyle tags.",
        "category": "Systems"
      },
      {
        "id": "anti-cheat-hitbox-sync",
        "title": "Server-Authoritative Hit Validation",
        "price": 3,
        "description": "Server-side hitbox validation and lag-compensation rewind to prevent client-side hit spoofing.",
        "category": "Security"
      },
      {
        "id": "match-end-sequence",
        "title": "Match Point & MVP Sequence",
        "price": 2,
        "description": "Match-point round highlighting, ace and clutch replay triggers, and end-game MVP selection.",
        "category": "Systems"
      }
    ],
    "genre": "shooter",
    "chip": "Tactical FPS",
    "splash": "valorant",
    "dataGame": "VALORANT",
    "description": "Round flow, abilities, recoil, buy phase, and competitive match systems.",
    "detailUrl": "games/game-valorant"
  }
];

module.exports = SEED_CATALOG;
