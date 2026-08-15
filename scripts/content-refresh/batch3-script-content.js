// Third batch of new scripts per game — a random count (3-8) per game rather
// than a flat number, so packs don't all grow in lockstep. Same shape as
// batch2-script-content.js: fed into add-batch3-scripts.js, which inserts
// each into the live catalog DB and writes the real assigned ids out to
// batch3-manifest.json for the downstream file-generation step.
module.exports = {
  apex: [
    { title: 'Care Package Vote & Deploy Timer', description: 'Squad-wide vote to call in an optional care package rotation, with a shared cooldown and deploy countdown.', category: 'Systems', price: 2 },
    { title: 'Grapple & Zipline Traversal Kit', description: 'Directional grapple-hook swings and zipline mounting with a fall-damage cancel window on landing.', category: 'Movement', price: 3 },
    { title: 'Legend Synergy Duo Bonuses', description: 'Detects complementary two-legend ability combos and grants a short synergy buff window when both land.', category: 'Systems', price: 2 },
    { title: 'Arena Round Draft & Bans', description: 'Best-of-X arena round structure with a pre-round weapon and ability ban/pick draft phase.', category: 'Systems', price: 3 },
    { title: 'Champion Squad Spotlight Camera', description: 'End-of-match cinematic camera that cycles through the winning squad’s final kills and positioning.', category: 'HUD', price: 2 }
  ],
  'call-of-duty': [
    { title: 'Perk-a-Cola Machine & Mystery Box Economy', description: 'Between-round Mystery Box rolls and vending-machine perk purchases feeding a wave-survival economy.', category: 'Economy', price: 3 },
    { title: 'Prestige Emblem & Calling Card Vault', description: 'Unlockable emblems and calling cards tied to prestige milestones, with a loadout-display vault.', category: 'Progression', price: 2 },
    { title: 'Care Package Marker & Steal Mechanic', description: 'Enemy-stealable care package markers with a contest window and a team-recolor on successful capture.', category: 'Streaks', price: 3 },
    { title: 'Gulag 1v1 Duel Queue', description: 'Post-death 1v1 duel queue with a pistol-round bracket that grants a second-chance respawn on a win.', category: 'Systems', price: 3 }
  ],
  fortnite: [
    { title: 'Zero Point Rift Portal Network', description: 'Placed rift-portal pairs with linked teleport pathing and a per-portal cooldown to limit reuse.', category: 'World', price: 3 },
    { title: 'Team Rumble Respawn Wave System', description: 'Wave-based respawns for team-rumble modes with an elimination-count victory threshold and spawn rotation.', category: 'Systems', price: 2 },
    { title: 'No-Build Mode Toggle & Overshield', description: 'A build-disable mode toggle paired with an overshield-only health model for arena-style playlists.', category: 'Systems', price: 2 },
    { title: 'Vault Keycard & Boss Loot Room', description: 'Keycard-gated vault rooms guarded by a mini-boss, ending in a high-tier loot-room reveal sequence.', category: 'Loot', price: 3 },
    { title: 'Prop-Disguise Movement System', description: 'Prop-mesh disguise mode with restricted movement speed and a break-disguise-on-damage rule.', category: 'Movement', price: 2 },
    { title: 'Squad Fill & Auto-Balance Matchmaking', description: 'Fills incomplete squads before match start and auto-balances skill rating evenly across the lobby.', category: 'Squad', price: 3 },
    { title: 'Weekly Bounty Board & Elimination Contracts', description: 'Rotating bounty-board contracts for eliminating tagged players, with a bonus-XP payout on completion.', category: 'Progression', price: 2 }
  ],
  'gta-v': [
    { title: 'Drug Trafficking Supply Chain', description: 'A source-to-sell supply loop with product quality, route risk scoring, and police-interdiction odds.', category: 'Economy', price: 4 },
    { title: 'Radio Station & In-Car Playlist Manager', description: 'Custom radio-station track lists with in-vehicle playback and a station-switch UI overlay.', category: 'Systems', price: 2 },
    { title: 'Bounty Hunter Contract Board', description: 'A contract board listing wanted NPC targets with capture-or-kill objectives and scaling payouts.', category: 'Missions', price: 3 }
  ],
  minecraft: [
    { title: 'Dungeon Room Generator & Loot Vault', description: 'Procedurally stitches dungeon rooms from a room pool, ending in a locked vault gated by a boss key.', category: 'World', price: 4 },
    { title: 'Guild & Party XP Sharing', description: 'Party formation with shared XP pooling and a guild tag prefix shown in chat and the scoreboard.', category: 'Systems', price: 3 },
    { title: 'Custom Potion Brewing Stand', description: 'Extended brewing-stand recipes that produce custom potion effects beyond the vanilla ingredient table.', category: 'Crafting', price: 2 },
    { title: 'Mob Spawner Tuning & Cap Control', description: 'Per-region mob-spawner rate tuning with a live spawn-cap dashboard to head off lag spikes.', category: 'Systems', price: 3 },
    { title: 'Player Housing Plot & Furniture Placement', description: 'Claimed housing plots with rotate-and-place furniture blocks and a plot-visit permission toggle.', category: 'Gameplay', price: 3 },
    { title: 'Elytra Firework Trick Combo Tracker', description: 'Tracks Elytra flight tricks — barrel rolls, firework-boost chains — for a style-score leaderboard.', category: 'Systems', price: 2 }
  ],
  pubg: [
    { title: 'Emergency Pickup Helicopter Extraction', description: 'A late-match helicopter extraction zone with a limited-seat evac window and bonus survival score.', category: 'Events', price: 3 },
    { title: 'Bluezone Damage Insurance Item', description: 'A consumable that halves the next zone-tick damage instance it absorbs, gated by a use cooldown.', category: 'Systems', price: 2 },
    { title: 'Weapon Skin & Crate Unlock System', description: 'A crate-opening animation flow that yields cosmetic weapon skins from a weighted rarity table.', category: 'Progression', price: 2 },
    { title: 'Team Formation & Custom Room Lobby', description: 'Custom-room lobby creation with team-size presets, password gating, and a ready-check flow.', category: 'Systems', price: 3 },
    { title: 'Throwable Trajectory Preview Arc', description: 'A predictive arc preview line for grenades and Molotovs before release, scaled by throw power.', category: 'Weapons', price: 2 },
    { title: 'Wall Breach Charge & Sonic Zone', description: 'Destructible-wall breach charges paired with a sonic-bombardment variant of the standard blue zone.', category: 'World', price: 3 },
    { title: 'Loot Truck & Roaming Convoy', description: 'A roaming high-tier loot truck that spawns an escort AI and drops its cargo when destroyed.', category: 'Loot', price: 3 },
    { title: 'Ranked Season Reset & Placement Matches', description: 'Season-boundary rank soft-reset with placement-match MMR calibration before ranked tiers resume.', category: 'Progression', price: 2 }
  ],
  roblox: [
    { title: 'Group Rank Sync & Perms', description: 'Syncs a player’s Roblox group rank to in-game permission tiers, with a cached refresh to dodge rate limits.', category: 'Systems', price: 3 },
    { title: 'UI Tween Menu Framework', description: 'A reusable TweenService-driven menu open/close framework with stacked panel transitions.', category: 'Systems', price: 2 },
    { title: 'Server-Side Hitbox Melee Combat', description: 'Server-authoritative melee hitbox detection with hit debounce and a lag-compensated raycast swing.', category: 'Combat', price: 4 },
    { title: 'Daily Reward Streak Calendar', description: 'A DataStore-backed daily login streak with escalating rewards and a streak-break grace period.', category: 'Systems', price: 2 }
  ],
  skyrim: [
    { title: 'Shrine Blessing & Standing Stone Tracker', description: 'Tracks visited shrines and the currently active standing-stone blessing, reapplying it safely on load.', category: 'Systems', price: 2 },
    { title: 'Werewolf & Vampire Lord Transformation', description: 'Timed beast-form transformations with a separate power bar, a feed/hunt mechanic, and form-specific perks.', category: 'Systems', price: 4 },
    { title: 'College of Winterhold Spell Research', description: 'Research-bench spell-tome crafting gated by school skill level and gathered arcane ingredients.', category: 'Progression', price: 3 },
    { title: 'Companion Housecarl Assignment', description: 'Assigns a housecarl to each owned hold, with home-guard behavior and a steward-report dialogue hook.', category: 'Systems', price: 2 },
    { title: 'Alchemy Ingredient Effect Discovery Log', description: 'A persistent journal that tracks discovered ingredient effects as the player experiments through use.', category: 'Crafting', price: 2 },
    { title: 'Civil War Questline Hold Control', description: 'A Stormcloak/Imperial hold-capture questline branch that tracks a hold-by-hold ownership map state.', category: 'Quests', price: 4 }
  ],
  valorant: [
    { title: 'Deathmatch Respawn & Loadout Rotation', description: 'Free-for-all deathmatch respawn logic with a periodic random-loadout rotation on every life.', category: 'Systems', price: 2 },
    { title: 'Replication Mode Ability Cooldown Reset', description: 'A single-agent replication variant that fast-resets ability cooldowns and removes ultimate cost.', category: 'Abilities', price: 2 },
    { title: 'Party Queue & Rank Restriction', description: 'Party-size-based rank-range matchmaking restriction to prevent high/low-skill queue abuse.', category: 'Systems', price: 2 },
    { title: 'Ability Combo Detector & Highlight', description: 'Detects chained multi-agent ability combos — setup plus follow-up kill — and flags them for a highlight reel.', category: 'Combat', price: 3 },
    { title: 'Tournament Bracket & Match Scheduling', description: 'Single- and double-elimination bracket generation with match scheduling slots for community tournaments.', category: 'Systems', price: 3 }
  ]
};
