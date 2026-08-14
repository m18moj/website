// New script names/descriptions/categories/prices, keyed by packId -> scriptId.
// Script ids are intentionally UNCHANGED from the original seed — only the
// customer-facing title/description/category/price move — so existing carts,
// past orders, and nothing else on disk needs to know this happened.
module.exports = {
  apex: {
    'movement-controller': { title: 'Slide-Hop Momentum Chain', description: 'Chains slides, jumps, and wall-bounces into a fluid momentum system with speed decay and stamina cost.', category: 'Movement', price: 3 },
    'ability-cast-system': { title: 'Legend Ability Framework', description: 'Tactical, passive, and ultimate ability data per legend, including charge rate, cooldown reduction, and interrupt rules.', category: 'Abilities', price: 3 },
    'loot-pickup-manager': { title: 'Death Box & Loot Roll System', description: 'Death box spawning, loot table rolls by rarity, and auto-stack pickup with radial ping support.', category: 'Loot', price: 3 },
    'squad-sync-logic': { title: 'Squad Ping & Comms Wheel', description: 'Context-aware ping wheel, squad status sync, and enemy-spotted callouts without voice chat.', category: 'Squad', price: 3 },
    'zone-collapse-system': { title: 'Ring Collapse & Damage Curve', description: 'Shrinking ring phases with escalating tick damage, warning telegraphs, and next-zone prediction.', category: 'World', price: 3 },
    'respawn-knockdown-flow': { title: 'Knockdown & Respawn Beacon', description: 'Bleed-out timers, self-revive items, and squad respawn beacons that drop teammates back into the fight.', category: 'Systems', price: 3 },
    'armor-health-layer': { title: 'Armor Tier & Shield Swap', description: 'Layered health/armor pools across four shield tiers with break effects and evo-shield style upgrades.', category: 'Combat', price: 3 },
    'character-role-framework': { title: 'Legend Perk & Passive Tree', description: 'Class-based passive perks (recon, support, assault) with unlockable perk tiers per legend.', category: 'Progression', price: 2 },
    'match-feed-hud': { title: 'Kill Feed & Squad Elims HUD', description: 'Live kill feed, squads-remaining counter, and elimination assist tracking for the match overlay.', category: 'HUD', price: 2 },
    'ranked-progression': { title: 'Ranked Ladder & RP Calculator', description: 'Placement-based RP gain/loss curves, tier demotion protection, and season-reset scaling.', category: 'Progression', price: 2 }
  },
  'call-of-duty': {
    'weapon-loadout-manager': { title: 'Custom Loadout & Gunsmith', description: 'Attachment slots, weapon blueprints, and loadout save slots with stat-altering attachment trees.', category: 'Weapons', price: 4 },
    'killstreak-controller': { title: 'Killstreak & Scorestreak Chain', description: 'Streak thresholds, care package drops, and streak-loss-on-death rules for kill and score-based streaks.', category: 'Streaks', price: 3 },
    'objective-capture-flow': { title: 'Objective Capture & Control', description: 'Domination-style point capture with contest states, capture speed scaling, and team-count multipliers.', category: 'Objective', price: 3 },
    'score-event-tracker': { title: 'Combat Score Event Log', description: 'Per-action score events (kills, assists, objective plays) feeding a live combat log and end-match summary.', category: 'Systems', price: 3 },
    'grenade-utility-system': { title: 'Lethal & Tactical Equipment', description: 'Cook timers, bounce physics, and effect zones for frags, flashes, smokes, and stun equipment.', category: 'Equipment', price: 3 },
    'multiplayer-spawn-logic': { title: 'Dynamic Spawn Safety System', description: 'Spawn-point scoring that avoids enemy sightlines and recent death clusters to reduce spawn-kills.', category: 'Systems', price: 3 },
    'hit-feedback-damage': { title: 'Hit Marker & Damage Numbers', description: 'Directional hit markers, headshot cues, and floating damage numbers synced to weapon damage falloff.', category: 'Feedback', price: 3 },
    'tactical-perk-system': { title: 'Perk Package Builder', description: 'Three-tier perk package system (movement, stealth, gunplay) with conflicting-perk validation.', category: 'Progression', price: 3 },
    'mission-objective-hud': { title: 'Objective Marker & Compass HUD', description: 'Waypoint markers, compass bearings, and objective status ticks for both MP and campaign-style modes.', category: 'HUD', price: 3 },
    'match-end-summary': { title: 'End-of-Match Scorecard', description: 'Post-match XP breakdown, MVP highlight selection, and challenge-progress summary screen.', category: 'Systems', price: 3 }
  },
  fortnite: {
    'build-assist-controller': { title: 'Build Edit & Piece Snap System', description: 'Wall/floor/ramp placement with edit confirm, 90-degree turns, and piece-swap while under fire.', category: 'Building', price: 3 },
    'loot-rarity-engine': { title: 'Loot Pool & Rarity Weighting', description: 'Chest and floor-loot spawn tables weighted by rarity with vaulted-item exclusion support.', category: 'Loot', price: 3 },
    'shield-regen-circuit': { title: 'Shield Potion & Regen Logic', description: 'Shield item stacking, overshield caps, and consumption animations for potions and mini-shields.', category: 'Systems', price: 2 },
    'storm-pressure-logic': { title: 'Storm Circle & Damage Ticks', description: 'Shrinking storm phases, safe-zone pathing hints, and ramping tick damage per phase.', category: 'World', price: 3 },
    'combat-flow-manager': { title: 'Third-Person Combat Loop', description: 'Aim-down-sights blend, weapon-swap timing, and fall-damage-on-landing combat feel.', category: 'Combat', price: 3 },
    'squad-ping-system': { title: 'Squad Marker & Loot Ping', description: 'Context pings for enemies, loot, and rally points visible through structures to squadmates.', category: 'Squad', price: 2 },
    'crosshair-aim-assist': { title: 'Controller Aim Assist Curve', description: 'Bloom-aware aim assist with slowdown-on-target and rotational assist tuned per weapon class.', category: 'Combat', price: 2 },
    'boogie-bounce-controller': { title: 'Emote & Bounce Pad System', description: 'Emote wheel playback plus launch-pad and bounce-pad physics with fall-damage negation.', category: 'Movement', price: 2 },
    'match-feed-hud': { title: 'Eliminations & Storm HUD', description: 'Live elimination feed, players-remaining counter, and storm-timer overlay.', category: 'HUD', price: 2 },
    'progression-save-state': { title: 'Battle Pass Progression Save', description: 'XP curve, level-up rewards, and battle-pass tier persistence across sessions.', category: 'Progression', price: 2 }
  },
  'gta-v': {
    'driving-controller': { title: 'Vehicle Handling & Damage Model', description: 'Grip-based handling per vehicle class with crumple damage, tire blowouts, and engine failure states.', category: 'Vehicles', price: 4 },
    'mission-event-trigger': { title: 'Mission Trigger & Checkpoint Flow', description: 'Scripted mission beats, checkpoint respawns, and branching objective triggers by zone entry.', category: 'Missions', price: 3 },
    'police-chase-system': { title: 'Wanted Chase & Roadblock AI', description: 'Escalating pursuit units, spike strips, and roadblock spawning tied to wanted level.', category: 'AI', price: 4 },
    'npc-traffic-ai': { title: 'Pedestrian & Traffic AI', description: 'Lane-following traffic AI, pedestrian pathing, and reaction behavior — flee, call police, or panic.', category: 'AI', price: 3 },
    'wanted-level-manager': { title: 'Wanted Level & Heat Decay', description: 'Star-rating heat system with line-of-sight loss, hideout cooldown, and bribe/heat-reduction items.', category: 'Systems', price: 3 },
    'heist-preparation-flow': { title: 'Heist Setup & Crew Payout', description: 'Multi-stage heist prep missions, crew-cut payout splits, and approach-choice branching.', category: 'Missions', price: 4 },
    'economy-property-system': { title: 'Property Ownership & Income', description: 'Purchasable properties, passive income ticks, and garage/vehicle storage per owned property.', category: 'Economy', price: 3 },
    'character-interaction-system': { title: 'NPC Dialogue & Relationship', description: 'Branching NPC conversations with relationship-level gating and context-sensitive interaction prompts.', category: 'Dialogue', price: 3 },
    'weapon-combat-controller': { title: 'Cover-Based Combat System', description: 'Cover snapping, blind-fire, and lock-on-assist combat loop for third-person gunfights.', category: 'Combat', price: 4 },
    'save-progression-state': { title: 'Save Slot & World State', description: 'Full save/load of player stats, owned assets, and world-state flags like completed missions and unlocks.', category: 'Systems', price: 3 }
  },
  minecraft: {
    'sword-combo-controller': { title: 'Melee Combo & Critical Hits', description: 'Chained melee combos, sprint-critical hits, and knockback tuning for close-range combat.', category: 'Combat', price: 3 },
    'mana-and-stamina-system': { title: 'Stamina & Hunger Bar System', description: 'Action-based stamina drain — sprinting, mining, jumping — with regen tied to hunger and rest state.', category: 'Systems', price: 3 },
    'enemy-aggro-ai': { title: 'Mob Aggro & Pathfinding AI', description: 'Line-of-sight aggro range, pack-hunting behavior, and A*-style pathfinding around terrain.', category: 'AI', price: 3 },
    'loot-drop-manager': { title: 'Block & Mob Drop Tables', description: 'Weighted drop tables for block breaks and mob kills, with fortune/looting-style multipliers.', category: 'Loot', price: 3 },
    'skill-tree-progression': { title: 'Tool & Enchant Progression', description: 'Tiered tool upgrades and an enchantment-style skill tree gated by XP levels.', category: 'Progression', price: 3 },
    'quest-objective-tracker': { title: 'Advancement & Quest Tracker', description: 'Achievement-style advancement tree with hidden and visible quests plus multi-step objective chains.', category: 'Quests', price: 3 },
    'inventory-equipment': { title: 'Inventory, Hotbar & Crafting Grid', description: 'Stackable inventory, drag-drop hotbar, and a 3x3 crafting grid with shaped-recipe matching.', category: 'Inventory', price: 3 },
    'dialogue-branch-system': { title: 'Villager Trade & Dialogue', description: 'Branching villager dialogue with trade-offer rotation and reputation-based price scaling.', category: 'Dialogue', price: 3 },
    'camera-follow-controller': { title: 'Third-Person Camera Rig', description: 'Smooth follow camera with collision avoidance, shoulder-swap, and first/third-person toggle.', category: 'Camera', price: 2 },
    'save-load-profile': { title: 'World Save & Chunk Persistence', description: 'Per-world save slots with chunk-based persistence for placed blocks and container contents.', category: 'Systems', price: 3 }
  },
  pubg: {
    'zone-collapse-system': { title: 'Blue Zone Shrink & Damage', description: 'Phased play-zone shrinking with damage-per-second scaling and a next-zone telegraph circle.', category: 'World', price: 3 },
    'loot-spawn-manager': { title: 'Loot Spawn & Airdrop Tables', description: 'Building and airdrop loot tables weighted by tier, with hot-drop location weighting.', category: 'Loot', price: 3 },
    'squad-communication': { title: 'Squad Markers & Ping System', description: 'Map-based squad markers, danger pings, and revive-request callouts visible to the whole team.', category: 'Squad', price: 3 },
    'weapon-handling': { title: 'Recoil Pattern & Attachment System', description: "Per-weapon recoil patterns modified by attachments — grips, muzzles, stocks — and stance.", category: 'Weapons', price: 3 },
    'health-armor-recovery': { title: 'Bandage, Boost & Armor Tiers', description: 'Healing-item timers, boost-item adrenaline effects, and three-tier armor/helmet durability.', category: 'Systems', price: 3 },
    'vehicle-system': { title: 'Vehicle Physics & Fuel System', description: 'Terrain-based vehicle physics, fuel consumption, and horn/honk noise-aggro for nearby players.', category: 'Vehicles', price: 3 },
    'match-feed-system': { title: 'Kill Feed & Alive-Count HUD', description: 'Elimination feed, players/teams-alive counter, and spectator-cam target cycling on death.', category: 'HUD', price: 3 },
    'enemy-awareness-ai': { title: 'Bot Awareness & Cover AI', description: 'Sound-based awareness radius, cover-seeking behavior, and peek-and-fire AI for fill bots.', category: 'AI', price: 3 },
    'supply-drop-events': { title: 'Airdrop Flare & Loot Crate', description: 'Flare-triggered supply plane routing, crate parachute physics, and a high-tier loot table on open.', category: 'Events', price: 3 },
    'match-summary-screen': { title: 'Chicken Dinner Summary Screen', description: 'Placement rank, damage-dealt stats, and survival-time summary shown at match end.', category: 'Systems', price: 3 }
  },
  roblox: {
    'resource-gathering': { title: 'Tool-Based Resource Nodes', description: 'ProximityPrompt-triggered resource nodes (trees, rocks, ore) with respawn timers and tool-tier gating.', category: 'Gameplay', price: 3 },
    'hunger-thirst-system': { title: 'Leaderstats & Currency System', description: 'IntValue leaderstats for coins and XP with DataStore-backed saving and a stat-change event bus.', category: 'Systems', price: 3 },
    'weather-cycle': { title: 'Day-Night Cycle & Lighting', description: 'TweenService-driven Lighting property cycling for a smooth in-game day/night loop.', category: 'World', price: 2 },
    'base-building-placement': { title: 'Tycoon Building & Purchase System', description: 'Classic Roblox tycoon droppers, conveyors, and button-purchase upgrades gated by cash.', category: 'Tycoon', price: 4 },
    'crafting-system': { title: 'Gamepass & Dev Product Shop', description: 'MarketplaceService-integrated gamepass and developer-product purchase flow with receipt handling.', category: 'Monetization', price: 4 },
    'enemy-night-patrol-ai': { title: 'NPC Patrol & Humanoid AI', description: "Humanoid:MoveTo patrol routes, PathfindingService chase logic, and simple attack-cooldown AI.", category: 'AI', price: 3 },
    'event-trigger-manager': { title: 'Round-Based Minigame Manager', description: 'Lobby-to-round state machine for round-based minigames, with intermission timers and team balancing.', category: 'Systems', price: 4 },
    'inventory-storage': { title: 'RemoteEvent Inventory Sync', description: 'Server-authoritative inventory with RemoteEvent-synced UI and exploit-resistant item validation.', category: 'Inventory', price: 3 },
    'progression-unlocks': { title: 'Obby Checkpoint & Stage System', description: 'Checkpoint-touch save points, stage progression, and leaderboard-tracked completion times for obbies.', category: 'Progression', price: 3 },
    'auto-save-recovery': { title: 'DataStore Auto-Save & Backup', description: 'Scheduled DataStoreService saves with retry-on-fail, session-locking, and BindToClose data protection.', category: 'Systems', price: 3 }
  },
  skyrim: {
    'quest-state-manager': { title: 'Quest Stage & Journal System', description: 'Multi-stage quest tracking with journal entries, stage-completion triggers, and quest-log UI hooks.', category: 'Quests', price: 3 },
    'skill-tree-system': { title: 'Perk Tree & Skill Leveling', description: 'Skill-use-based leveling (learn by doing) feeding into a branching perk tree with prerequisite gating.', category: 'Progression', price: 3 },
    'loot-rarity-engine': { title: 'Loot Tables & Enchanted Drops', description: 'Level-scaled loot tables with rarity tiers and randomized enchantment rolls on weapon/armor drops.', category: 'Loot', price: 3 },
    'dialogue-branch-system': { title: 'Branching Dialogue & Persuasion', description: 'Tree-based NPC dialogue with persuasion and intimidate skill checks gating certain branches.', category: 'Dialogue', price: 3 },
    'world-event-manager': { title: 'Radiant World Events', description: 'Randomized ambient world events — bandit attacks, traveling merchants, dragon sightings — on a timer.', category: 'World', price: 3 },
    'inventory-equipment': { title: 'Equipment Slots & Weight System', description: 'Armor and weapon equip slots with carry-weight limits and encumbrance-based movement penalties.', category: 'Inventory', price: 3 },
    'faction-reputation-logic': { title: 'Faction Standing & Bounty System', description: 'Per-faction reputation tracking with bounty accrual, guard hostility, and faction-quest gating.', category: 'Systems', price: 2 },
    'travel-fast-travel': { title: 'Fast Travel & Map Discovery', description: 'Discoverable map markers unlocking fast-travel points, with random-encounter chance on route.', category: 'World', price: 2 },
    'crafting-smithing': { title: 'Smithing & Alchemy Crafting', description: 'Material-based smithing upgrades and potion-brewing alchemy with ingredient-effect discovery.', category: 'Crafting', price: 3 },
    'save-character-state': { title: 'Character Save & Build State', description: 'Full character-state save — stats, perks, inventory, quest flags — across multiple save slots.', category: 'Systems', price: 3 }
  },
  valorant: {
    'weapon-recoil-system': { title: 'Weapon Recoil & Spray Pattern', description: 'Per-weapon spray-pattern recoil with reset timers and first-bullet-accuracy modeling.', category: 'Weapons', price: 3 },
    'ability-cooldowns': { title: 'Agent Ability Charge System', description: 'Charge-based ability economy — signature abilities free, others bought — with ultimate-point accrual.', category: 'Abilities', price: 3 },
    'buy-phase-manager': { title: 'Buy Phase & Economy System', description: 'Round-start buy menu with credit rewards, loss-bonus economy, and per-side loadout saving.', category: 'Economy', price: 3 },
    'round-timer-controller': { title: 'Round Timer & Spike Phases', description: 'Round clock, plant/defuse phase timers, and overtime sudden-death round handling.', category: 'Systems', price: 3 },
    'ability-hit-detection': { title: 'Ability Hit Reg & Status Effects', description: 'Hitbox-accurate ability collision with status effects — blind, slow, vulnerable — and duration stacking.', category: 'Combat', price: 3 },
    'spatial-audio-caller': { title: 'Positional Audio & Footstep Callouts', description: '3D positional audio for footsteps and abilities, feeding an auto-callout system for enemy direction.', category: 'Audio', price: 2 },
    'scoreboard-round-stats': { title: 'Scoreboard & Combat Score', description: 'Live scoreboard with combat score, first-bloods, and clutch tracking per round.', category: 'HUD', price: 2 },
    'agent-role-system': { title: 'Agent Role & Kit Framework', description: "Duelist, controller, initiator, and sentinel role framework defining each agent's ability kit and playstyle tags.", category: 'Systems', price: 2 },
    'anti-cheat-hitbox-sync': { title: 'Server-Authoritative Hit Validation', description: 'Server-side hitbox validation and lag-compensation rewind to prevent client-side hit spoofing.', category: 'Security', price: 3 },
    'match-end-sequence': { title: 'Match Point & MVP Sequence', description: 'Match-point round highlighting, ace and clutch replay triggers, and end-game MVP selection.', category: 'Systems', price: 2 }
  }
};
