/*
 * ScripForge — Collectible Hunt Tracker
 * Pack: GTA V Pack | Category: Systems
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Map-wide collectible discovery log with a completion percentage and category breakdown.
 *
 * Written for single-player use via ScriptHookVDotNet — not for GTA Online.
 */

using System;
using System.Collections.Generic;
using System.Linq;
using GTA;
using GTA.Math;
using GTA.UI;

namespace ScripForge.Systems
{
    internal enum CollectibleCategory
    {
        Letterscraps,
        NuclearWaste,
        Spaceship,
        Playboy,
    }

    internal class CollectibleDefinition
    {
        public string Label;
        public CollectibleCategory Category;
        public Vector3 Position;
        public bool Found;

        public CollectibleDefinition(string label, CollectibleCategory category, Vector3 position)
        {
            Label = label;
            Category = category;
            Position = position;
            Found = false;
        }
    }

    /// <summary>
    /// Tracks a fixed list of map collectibles across several categories. Blips every undiscovered
    /// item, marks items found on proximity, and reports overall + per-category completion
    /// percentage through a HUD readout and on-demand summary.
    /// </summary>
    public class CollectibleHuntTracker : Script
    {
        private readonly List<CollectibleDefinition> _collectibles = new List<CollectibleDefinition>
        {
            new CollectibleDefinition("Letter Scrap #1", CollectibleCategory.Letterscraps, new Vector3(-1445.0f, -650.0f, 28.0f)),
            new CollectibleDefinition("Letter Scrap #2", CollectibleCategory.Letterscraps, new Vector3(-1300.0f, -500.0f, 32.0f)),
            new CollectibleDefinition("Letter Scrap #3", CollectibleCategory.Letterscraps, new Vector3(-900.0f, -300.0f, 35.0f)),
            new CollectibleDefinition("Nuclear Waste Barrel #1", CollectibleCategory.NuclearWaste, new Vector3(2900.0f, 2900.0f, 40.0f)),
            new CollectibleDefinition("Nuclear Waste Barrel #2", CollectibleCategory.NuclearWaste, new Vector3(3100.0f, 3200.0f, 41.0f)),
            new CollectibleDefinition("Spaceship Part #1", CollectibleCategory.Spaceship, new Vector3(-2200.0f, 4200.0f, 47.0f)),
            new CollectibleDefinition("Spaceship Part #2", CollectibleCategory.Spaceship, new Vector3(1200.0f, -2100.0f, 52.0f)),
            new CollectibleDefinition("Playboy Magazine #1", CollectibleCategory.Playboy, new Vector3(-1100.0f, 550.0f, 128.0f)),
            new CollectibleDefinition("Playboy Magazine #2", CollectibleCategory.Playboy, new Vector3(430.0f, -980.0f, 30.0f)),
        };

        private readonly Dictionary<CollectibleDefinition, Blip> _blips = new Dictionary<CollectibleDefinition, Blip>();
        private const float PickupRadius = 2.0f;
        private DateTime _nextScan = DateTime.MinValue;

        public CollectibleHuntTracker()
        {
            Tick += OnTick;
            KeyDown += OnKeyDown;

            foreach (var item in _collectibles)
            {
                Blip blip = World.CreateBlip(item.Position);
                blip.Sprite = BlipSprite.CollectableAmmo;
                blip.Color = CategoryColor(item.Category);
                blip.Name = item.Label;
                blip.IsShortRange = true;
                _blips[item] = blip;
            }
        }

        private void OnTick(object sender, EventArgs e)
        {
            if (DateTime.Now < _nextScan)
                return;

            _nextScan = DateTime.Now.AddMilliseconds(500);
            ScanForPickups();
        }

        private void OnKeyDown(object sender, KeyEventArgs e)
        {
            if (e.KeyCode == System.Windows.Forms.Keys.F11)
                ShowSummary();
        }

        private void ScanForPickups()
        {
            Vector3 playerPos = Game.Player.Character.Position;

            foreach (var item in _collectibles)
            {
                if (item.Found)
                    continue;

                if (playerPos.DistanceTo(item.Position) > PickupRadius)
                    continue;

                item.Found = true;

                if (_blips.TryGetValue(item, out Blip blip) && blip.Exists())
                    blip.Remove();

                Notification.PostTicker(string.Format("~g~Found: {0} ({1}/{2} total)", item.Label, TotalFound(), _collectibles.Count), false);
            }
        }

        private void ShowSummary()
        {
            int total = _collectibles.Count;
            int found = TotalFound();
            float overallPct = total == 0 ? 0f : (found / (float)total) * 100f;

            Notification.PostTicker(string.Format("~y~Collectibles: {0}/{1} ({2:0}% complete)", found, total, overallPct), false);

            foreach (CollectibleCategory category in Enum.GetValues(typeof(CollectibleCategory)))
            {
                var inCategory = _collectibles.Where(c => c.Category == category).ToList();
                if (inCategory.Count == 0)
                    continue;

                int categoryFound = inCategory.Count(c => c.Found);
                float categoryPct = (categoryFound / (float)inCategory.Count) * 100f;
                Notification.PostTicker(string.Format("~b~{0}: {1}/{2} ({3:0}%)", category, categoryFound, inCategory.Count, categoryPct), false);
            }
        }

        private int TotalFound()
        {
            return _collectibles.Count(c => c.Found);
        }

        private BlipColor CategoryColor(CollectibleCategory category)
        {
            switch (category)
            {
                case CollectibleCategory.Letterscraps:
                    return BlipColor.Yellow;
                case CollectibleCategory.NuclearWaste:
                    return BlipColor.Green;
                case CollectibleCategory.Spaceship:
                    return BlipColor.Blue;
                case CollectibleCategory.Playboy:
                    return BlipColor.Pink;
                default:
                    return BlipColor.White;
            }
        }
    }
}
