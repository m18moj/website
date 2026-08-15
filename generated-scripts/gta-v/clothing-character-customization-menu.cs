/*
 * ScripForge — Clothing & Character Customization Menu
 * Pack: GTA V Pack | Category: Systems
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Wardrobe menu for cycling outfit component slots and saving/loading named outfit presets.
 *
 * Written for single-player use via ScriptHookVDotNet — not for GTA Online.
 */

using System;
using System.Collections.Generic;
using System.Windows.Forms;
using GTA;
using GTA.Native;

namespace ScripForge.Systems
{
    /// <summary>
    /// A simple wardrobe overlay that lets the player cycle through drawable variations
    /// for each clothing component slot on the current ped model, and save the resulting
    /// combination as a named "outfit" that can be recalled instantly later.
    /// </summary>
    public class ClothingCharacterCustomizationMenu : Script
    {
        private class Outfit
        {
            public string Name;
            public Dictionary<int, int> ComponentDrawables = new Dictionary<int, int>();
            public Dictionary<int, int> ComponentTextures = new Dictionary<int, int>();
        }

        // Standard ped component slot IDs used by SET_PED_COMPONENT_VARIATION.
        private readonly int[] _componentSlots = { 0, 3, 4, 6, 7, 8, 9, 11 };
        private int _selectedSlotIndex;

        private readonly List<Outfit> _savedOutfits = new List<Outfit>();
        private bool _menuOpen;

        public ClothingCharacterCustomizationMenu()
        {
            Tick += OnTick;
            KeyDown += OnKeyDown;
        }

        private void OnTick(object sender, EventArgs e)
        {
            if (!_menuOpen)
                return;

            DrawMenu();
        }

        private void OnKeyDown(object sender, KeyEventArgs e)
        {
            if (e.KeyCode == Keys.F6)
            {
                _menuOpen = !_menuOpen;
                return;
            }

            if (!_menuOpen)
                return;

            switch (e.KeyCode)
            {
                case Keys.Left:
                    _selectedSlotIndex = (_selectedSlotIndex - 1 + _componentSlots.Length) % _componentSlots.Length;
                    break;
                case Keys.Right:
                    _selectedSlotIndex = (_selectedSlotIndex + 1) % _componentSlots.Length;
                    break;
                case Keys.Up:
                    CycleDrawable(1);
                    break;
                case Keys.Down:
                    CycleDrawable(-1);
                    break;
                case Keys.F7:
                    SaveCurrentOutfit($"Outfit {_savedOutfits.Count + 1}");
                    break;
                case Keys.F8:
                    LoadOutfit(0);
                    break;
            }
        }

        private void CycleDrawable(int direction)
        {
            Ped player = Game.Player.Character;
            int slot = _componentSlots[_selectedSlotIndex];

            int currentDrawable = Function.Call<int>(Hash.GET_PED_DRAWABLE_VARIATION, player, slot);
            int numVariations = Function.Call<int>(Hash.GET_NUMBER_OF_PED_DRAWABLE_VARIATIONS, player, slot);

            if (numVariations <= 0)
                return;

            int nextDrawable = (currentDrawable + direction + numVariations) % numVariations;
            int numTextures = Function.Call<int>(Hash.GET_NUMBER_OF_PED_TEXTURE_VARIATIONS, player, slot, nextDrawable);
            int texture = numTextures > 0 ? 0 : 0;

            Function.Call(Hash.SET_PED_COMPONENT_VARIATION, player, slot, nextDrawable, texture, 0);
        }

        private void SaveCurrentOutfit(string name)
        {
            Ped player = Game.Player.Character;
            var outfit = new Outfit { Name = name };

            foreach (int slot in _componentSlots)
            {
                outfit.ComponentDrawables[slot] = Function.Call<int>(Hash.GET_PED_DRAWABLE_VARIATION, player, slot);
                outfit.ComponentTextures[slot] = Function.Call<int>(Hash.GET_PED_TEXTURE_VARIATION, player, slot);
            }

            _savedOutfits.Add(outfit);
            GTA.UI.Notification.PostTicker($"Saved outfit: {name}", false);
        }

        private void LoadOutfit(int index)
        {
            if (index < 0 || index >= _savedOutfits.Count)
            {
                GTA.UI.Notification.PostTicker("No saved outfit at that slot.", false);
                return;
            }

            Ped player = Game.Player.Character;
            Outfit outfit = _savedOutfits[index];

            foreach (int slot in _componentSlots)
            {
                int drawable = outfit.ComponentDrawables[slot];
                int texture = outfit.ComponentTextures[slot];
                Function.Call(Hash.SET_PED_COMPONENT_VARIATION, player, slot, drawable, texture, 0);
            }

            GTA.UI.Notification.PostTicker($"Loaded outfit: {outfit.Name}", false);
        }

        private void DrawMenu()
        {
            int slot = _componentSlots[_selectedSlotIndex];
            GTA.UI.Screen.ShowSubtitle(
                $"~b~Wardrobe~w~ - Slot {slot} | Left/Right: change slot, Up/Down: cycle look, F7: save, F8: load", 100);
        }
    }
}
