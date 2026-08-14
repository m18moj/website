// Second batch of scripts — 10 more per game, on top of the original 10.
// No explicit ids here (unlike the first batch): createPack/createScript
// auto-slugs from the title and the migration script that consumes this
// captures the *actual* resulting id, so there's no risk of a hand-typed id
// drifting from what slugify() really produces.
module.exports = {
  apex: [
    { title: 'Weapon Attachment & Hop-Up System', category: 'Weapons', price: 3, description: 'Scope, mag, and hop-up attachment slots with stat modifiers layered onto a base weapon.' },
    { title: 'Death Recap & Damage Log', category: 'Feedback', price: 2, description: 'A post-death breakdown of exactly what damaged you, from what, and in what order.' },
    { title: 'Banner Collection & Respawn Beacon', category: 'Systems', price: 3, description: 'Collectible squadmate banners and a respawn-beacon flow to bring them back into the match.' },
    { title: 'Smart Ping Priority Queue', category: 'Squad', price: 2, description: 'Ranks and filters context pings by relevance so the most urgent callout always surfaces first.' },
    { title: 'Legend Select & Draft Lock', category: 'Systems', price: 2, description: 'Character-select flow with pick/lock timers and duplicate-pick prevention within a squad.' },
    { title: 'Care Package Drop & Loot Table', category: 'Loot', price: 3, description: 'High-tier care package spawning with its own weighted loot table, separate from ground loot.' },
    { title: 'Climb & Traversal Assist', category: 'Movement', price: 3, description: 'Ledge grabs, mantling, and zipline traversal layered on top of core movement.' },
    { title: 'Finisher & Execution Sequence', category: 'Combat', price: 2, description: 'Scripted finisher animations and hit-confirm sequencing on a knocked-down target.' },
    { title: 'Team Composition Synergy Tracker', category: 'Systems', price: 2, description: 'Tracks squad legend picks and surfaces synergy bonuses for compatible team compositions.' },
    { title: 'Season Battle Pass & Challenges', category: 'Progression', price: 3, description: 'Season XP curve, tiered battle-pass rewards, and daily/weekly challenge tracking.' }
  ],
  'call-of-duty': [
    { title: 'Gunsmith Attachment Tree', category: 'Weapons', price: 4, description: 'A branching attachment tree per weapon with conflicting-slot rules and stat previews.' },
    { title: 'Weapon Camo Challenge Tracker', category: 'Progression', price: 2, description: 'Per-weapon camo unlock challenges (kills, headshots, streaks) with progress tracking.' },
    { title: 'Prestige & Rank Reset System', category: 'Progression', price: 3, description: 'Prestige-tier rank resets with carried-over cosmetic unlocks and reset bonuses.' },
    { title: 'Field Upgrade Charge System', category: 'Equipment', price: 2, description: 'Charge-based field upgrades that regenerate over time instead of using ammo/pickups.' },
    { title: 'Killcam & Replay Capture', category: 'Feedback', price: 3, description: 'Rolling buffer capture of the last few seconds before a death, replayable from the killer\'s view.' },
    { title: 'Ground Loot & Contract System', category: 'Systems', price: 4, description: 'Battle-royale-style ground loot spawning paired with optional side-contract objectives.' },
    { title: 'Vehicle Handling & Mounted Weapons', category: 'Vehicles', price: 4, description: 'Drivable vehicle physics with a mounted-weapon seat that overrides normal aiming.' },
    { title: 'Clan Tag & Squad Identity System', category: 'Systems', price: 2, description: 'Clan tag display, squad banners, and identity persistence across matches.' },
    { title: 'Combat Record & Stat Tracking', category: 'Systems', price: 2, description: 'Persistent per-weapon and per-mode stat tracking across sessions, not just per-match.' },
    { title: 'Wave-Based Horde Round System', category: 'Systems', price: 4, description: 'Escalating enemy wave spawning with round-based difficulty scaling and between-round shopping.' }
  ],
  fortnite: [
    { title: 'Structure Edit & Piece Confirm', category: 'Building', price: 3, description: 'Edit-pattern selection with confirm/cancel and a piece-swap-while-editing safeguard.' },
    { title: 'Named Location Loot Tiering', category: 'Loot', price: 2, description: 'Point-of-interest loot density tiers so named locations feel meaningfully different to drop into.' },
    { title: 'Vehicle Driving & Fuel System', category: 'Vehicles', price: 3, description: 'Car and boat driving physics with a fuel-consumption and refuel-can mechanic.' },
    { title: 'Fishing & Consumable Loot System', category: 'Gameplay', price: 2, description: 'Fishing-spot interaction yielding weapons, consumables, and healing items.' },
    { title: 'Reboot Van & Teammate Revive', category: 'Systems', price: 3, description: 'Eliminated-teammate reboot card collection and a reboot-van respawn flow.' },
    { title: 'Crafting & Upgrade Bench', category: 'Crafting', price: 3, description: 'Weapon-upgrade bench stations that consume materials to boost rarity tier.' },
    { title: 'Mythic Weapon Ability System', category: 'Weapons', price: 4, description: 'Special mythic-tier weapons with a unique triggered ability beyond normal fire modes.' },
    { title: 'Season Quest & XP Milestone Tracker', category: 'Progression', price: 2, description: 'Weekly quest tracking with milestone-based bonus XP rewards.' },
    { title: 'Locker & Cosmetic Equip System', category: 'Systems', price: 2, description: 'Skin, back-bling, and emote equip management with a locker-style selection UI.' },
    { title: 'Creative Island Trigger & Device System', category: 'Systems', price: 3, description: 'A generic trigger/device framework for building custom game modes on a creative island.' }
  ],
  'gta-v': [
    { title: 'Garage & Vehicle Storage Manager', category: 'Systems', price: 3, description: 'Owned-vehicle garage storage with retrieval, valet, and impound-recovery flows.' },
    { title: 'In-Game Phone & Contact Menu', category: 'Systems', price: 3, description: 'A phone overlay with a contacts list that triggers calls, texts, and app-style menus.' },
    { title: 'Weather & Time-of-Day Controller', category: 'World', price: 2, description: 'Scripted weather transitions and a time-of-day cycle independent of the game\'s default clock.' },
    { title: 'Gang Territory & Turf Control', category: 'World', price: 4, description: 'Map-zone territory ownership that shifts based on scripted turf-war outcomes.' },
    { title: 'Stock Market & Investment System', category: 'Economy', price: 3, description: 'A fluctuating in-game stock market with buy/sell orders and event-driven price swings.' },
    { title: 'Character Switch & Camera Transition', category: 'Systems', price: 3, description: 'The signature swooping camera transition when switching between playable characters.' },
    { title: 'Stunt Jump & Trick Score Tracker', category: 'Systems', price: 2, description: 'Stunt-jump zone detection with air-time and trick-based scoring.' },
    { title: 'Clothing & Character Customization Menu', category: 'Systems', price: 3, description: 'A wardrobe menu for outfit slots, saved looks, and quick-change presets.' },
    { title: 'Random World Event Spawner', category: 'World', price: 3, description: 'Ambient random events (robberies, hitchhikers, street races) spawned on a weighted timer.' },
    { title: 'Parachute & Skydiving Controller', category: 'Movement', price: 2, description: 'Freefall and parachute deployment physics with a landing-accuracy scoring option.' }
  ],
  minecraft: [
    { title: 'Custom Enchantment Registry', category: 'Systems', price: 3, description: 'A registry for defining new enchantments with their own apply/trigger logic beyond vanilla.' },
    { title: 'Player Shop & Trading Stall', category: 'Economy', price: 3, description: 'Player-run shop stalls with listed items, prices, and a purchase-transaction flow.' },
    { title: 'Land Claim & Protection System', category: 'Systems', price: 4, description: 'Chunk-based land claiming with build/break protection for the claiming player.' },
    { title: 'Custom Boss Mob & Arena', category: 'AI', price: 4, description: 'A scripted boss mob with phase-based attack patterns inside a dedicated arena region.' },
    { title: 'Custom Crop Growth System', category: 'Gameplay', price: 2, description: 'Custom crop types with staged growth, fertilizer effects, and yield-on-harvest logic.' },
    { title: 'Warp Point & Teleportation', category: 'Systems', price: 2, description: 'Named warp points with a teleport menu and optional cooldown/cost per use.' },
    { title: 'PvP Arena & Kit System', category: 'Combat', price: 3, description: 'Arena queueing with preset combat kits handed out on match start.' },
    { title: 'Scoreboard & Stats Display', category: 'Systems', price: 2, description: 'A live sidebar scoreboard showing custom per-player stats pulled from your plugin\'s data.' },
    { title: 'Custom Crafting Recipe System', category: 'Crafting', price: 2, description: 'Registers new shaped/shapeless recipes at runtime beyond the vanilla recipe book.' },
    { title: 'Pet & Companion Follower', category: 'Gameplay', price: 3, description: 'A tameable companion entity that follows, fights alongside, and levels up with the player.' }
  ],
  pubg: [
    { title: 'Throwable & Utility Grenade System', category: 'Equipment', price: 3, description: 'Frag, smoke, and stun throwable physics with cook timers and effect-zone application.' },
    { title: 'Stance & Prone Movement', category: 'Movement', price: 2, description: 'Stand/crouch/prone stance switching with accuracy and movement-speed modifiers per stance.' },
    { title: 'Weapon Attachment Loadout', category: 'Weapons', price: 3, description: 'Scope, grip, and magazine attachment slots with per-weapon compatibility rules.' },
    { title: 'Red Zone Bombing Event', category: 'Events', price: 3, description: 'A random artillery-strike zone that telegraphs then deals area damage on a timer.' },
    { title: 'Care Package Airdrop', category: 'Loot', price: 3, description: 'Flare-triggered supply-plane routing and a high-tier loot crate on landing.' },
    { title: 'Spectator & Killer-Cam System', category: 'HUD', price: 2, description: 'Free-cam and killer-cam spectating for eliminated players until the match ends.' },
    { title: 'Downed State & Team Revive', category: 'Systems', price: 3, description: 'A crawl-and-call-for-help downed state with a team-revive interaction window.' },
    { title: 'Ranked MMR & Tier System', category: 'Progression', price: 2, description: 'Placement-based MMR gain/loss with tier promotion and demotion protection.' },
    { title: 'Inventory Weight & Encumbrance', category: 'Inventory', price: 2, description: 'Carry-weight limits with movement-speed penalties past an encumbrance threshold.' },
    { title: 'Safe Zone Rotation Predictor', category: 'World', price: 3, description: 'A heuristic predictor that estimates the next safe-zone center before it\'s revealed.' }
  ],
  roblox: [
    { title: 'Team Select & Spawn System', category: 'Systems', price: 2, description: 'A team-select lobby UI with team-specific spawn point assignment.' },
    { title: 'Global Leaderboard & Stats', category: 'Systems', price: 3, description: 'OrderedDataStore-backed global leaderboards ranked by any tracked stat.' },
    { title: 'Admin Command & Moderation', category: 'Systems', price: 3, description: 'A chat-command framework for kick/ban/teleport-style admin actions, gated by a role table.' },
    { title: 'Chat Tag & Filter System', category: 'Systems', price: 2, description: 'Custom chat tags per player rank plus TextService-based message filtering.' },
    { title: 'NPC Quest Giver & Dialogue', category: 'Dialogue', price: 3, description: 'ProximityPrompt-driven NPC dialogue trees that hand out and track quests.' },
    { title: 'VehicleSeat & Drivable Vehicle', category: 'Systems', price: 3, description: 'A VehicleSeat-based drivable car with throttle, steering, and occupancy detection.' },
    { title: 'Custom Animation Controller', category: 'Systems', price: 2, description: 'An Animator-based controller for blending and prioritizing custom animation tracks.' },
    { title: 'Particle & VFX Trigger', category: 'Systems', price: 2, description: 'A reusable ParticleEmitter/Trail trigger system for hit effects and ability visuals.' },
    { title: 'Player Trading System', category: 'Systems', price: 4, description: 'A server-validated two-player trade window with offer confirmation on both sides.' },
    { title: 'Anti-Exploit Remote Validation', category: 'Security', price: 4, description: 'Server-side RemoteEvent argument validation and rate-limiting to reject exploited client calls.' }
  ],
  skyrim: [
    { title: 'Follower Recruitment & Management', category: 'Systems', price: 3, description: 'Recruitable follower dialogue, inventory sharing, and a follower-roster management system.' },
    { title: 'Spell Learning & Tome System', category: 'Systems', price: 2, description: 'Spell tome reading that teaches spells and tracks a player\'s known-spell list.' },
    { title: 'Dragon Shout & Word Wall', category: 'Systems', price: 3, description: 'Word wall discovery, shout word unlocking, and shout cooldown/charge management.' },
    { title: 'Marriage & Player Home', category: 'Systems', price: 3, description: 'A marriage dialogue flow plus player-home ownership with storage and a resting bonus.' },
    { title: 'Crime & Bounty Tracking', category: 'Systems', price: 2, description: 'Witnessed-crime detection that accrues a bounty and triggers guard hostility per hold.' },
    { title: 'Perk Respec & Legendary Skill', category: 'Progression', price: 2, description: 'Perk-point refund on respec, and legendary-skill reset for past-100 skill leveling.' },
    { title: 'Follower Combat AI', category: 'AI', price: 3, description: 'Combat-style AI packages for followers — flanking, healing casts, and retreat-at-low-health.' },
    { title: 'Merchant Restock & Inventory', category: 'Economy', price: 2, description: 'Timed merchant gold and inventory restocking with per-vendor specialty item pools.' },
    { title: 'Weather & Seasonal Effects', category: 'World', price: 2, description: 'Weather-triggered gameplay effects (frost damage in storms, stealth bonus in fog).' },
    { title: 'Daedric Artifact Quest Tracker', category: 'Quests', price: 3, description: 'A tracker for the Daedric Prince quest line with artifact-collection progress.' }
  ],
  valorant: [
    { title: 'Ultimate Orb Pickup & Charge', category: 'Abilities', price: 2, description: 'Map-placed ultimate orbs that grant bonus ultimate charge on pickup.' },
    { title: 'Spike Plant & Defuse Sequence', category: 'Systems', price: 3, description: 'Plant/defuse interaction timers with a progress bar and interrupt-on-damage rule.' },
    { title: 'Agent Select & Lock-In', category: 'Systems', price: 2, description: 'Agent-select screen flow with per-team duplicate-pick prevention and lock-in confirmation.' },
    { title: 'Minimap & Callout Marker', category: 'HUD', price: 2, description: 'A minimap overlay with named callout zones and pingable enemy-position markers.' },
    { title: 'Weapon Inspect & Skin Display', category: 'Systems', price: 2, description: 'A weapon-inspect animation sequence that showcases equipped skins and finishers.' },
    { title: 'Ranked Rating Progression', category: 'Progression', price: 2, description: 'Match-result-based RR gain/loss with rank-tier promotion series handling.' },
    { title: 'Team Composition Analyzer', category: 'Systems', price: 2, description: 'Analyzes a team\'s agent picks and flags role gaps (no sentinel, no controller, etc).' },
    { title: 'Smoke & Wall Ability Collision', category: 'Combat', price: 3, description: 'Volumetric collision detection for smoke/wall abilities blocking sightlines and bullets.' },
    { title: 'Death Replay & Kill Cam', category: 'Feedback', price: 3, description: 'A short replay buffer showing the killer\'s perspective right after a player dies.' },
    { title: 'Leaver Penalty & Queue Restriction', category: 'Systems', price: 2, description: 'Match-abandon detection with escalating queue-time penalties for repeat leavers.' }
  ]
};
