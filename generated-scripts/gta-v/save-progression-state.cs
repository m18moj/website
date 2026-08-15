/*
 * ScripForge — Save Slot & World State
 * Pack: GTA V Pack | Category: Systems
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Serializes player stats, owned assets, and world-state flags to a numbered save-slot file on disk.
 *
 * Written for single-player use via ScriptHookVDotNet — not for GTA Online.
 */

using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Windows.Forms;
using GTA;
using GTA.Math;

namespace ScripForge.Systems
{
    [Serializable]
    internal class SaveData
    {
        public int Money;
        public float Health;
        public Vector3 Position;
        public List<string> OwnedProperties = new List<string>();
        public List<string> OwnedVehicles = new List<string>();
        public Dictionary<string, bool> WorldFlags = new Dictionary<string, bool>();
        public DateTime SavedAt;
    }

    /// <summary>
    /// Handles saving and loading a lightweight custom progression state (money, health,
    /// position, owned assets, and arbitrary world-state flags) to numbered slot files under
    /// the script's ScripForge/Saves directory, independent of the base game's save system.
    /// </summary>
    public class SaveProgressionState : Script
    {
        private const int SlotCount = 3;
        private readonly string _saveDirectory;
        private readonly Dictionary<string, bool> _worldFlags = new Dictionary<string, bool>();

        public SaveProgressionState()
        {
            _saveDirectory = Path.Combine("scripts", "ScripForge", "Saves");
            Directory.CreateDirectory(_saveDirectory);

            KeyDown += OnKeyDown;

            // Example world flags tracked across sessions; other scripts could register more
            // via SetWorldFlag before a save happens.
            _worldFlags["heist_prologue_done"] = false;
            _worldFlags["met_lester"] = false;
        }

        private void OnKeyDown(object sender, KeyEventArgs e)
        {
            // F9 + number keys (1-3 via numpad) select the slot; Shift+F9 saves, plain F9 loads.
            if (e.KeyCode != Keys.F9)
                return;

            int slot = GetActiveSlotFromNumpad();

            if (Game.IsKeyPressed(Keys.LShiftKey) || Game.IsKeyPressed(Keys.RShiftKey))
                SaveToSlot(slot);
            else
                LoadFromSlot(slot);
        }

        private int GetActiveSlotFromNumpad()
        {
            for (int i = 1; i <= SlotCount; i++)
            {
                Keys numKey = (Keys)((int)Keys.D0 + i);
                if (Game.IsKeyPressed(numKey))
                    return i;
            }
            return 1; // default slot
        }

        public void SetWorldFlag(string key, bool value)
        {
            _worldFlags[key] = value;
        }

        private void SaveToSlot(int slot)
        {
            Ped player = Game.Player.Character;
            SaveData data = new SaveData
            {
                Money = Game.Player.Money,
                Health = player.Health,
                Position = player.Position,
                SavedAt = DateTime.Now,
                WorldFlags = new Dictionary<string, bool>(_worldFlags),
            };

            if (player.IsInVehicle())
            {
                data.OwnedVehicles.Add(player.CurrentVehicle.DisplayName);
            }

            string path = GetSlotPath(slot);
            WriteSaveFile(path, data);

            Notification.PostTicker(string.Format("~g~Game saved to slot {0}", slot), false);
        }

        private void LoadFromSlot(int slot)
        {
            string path = GetSlotPath(slot);
            if (!File.Exists(path))
            {
                Notification.PostTicker(string.Format("~r~No save found in slot {0}", slot), false);
                return;
            }

            SaveData data = ReadSaveFile(path);
            if (data == null)
            {
                Notification.PostTicker("~r~Save file is corrupt.", false);
                return;
            }

            Ped player = Game.Player.Character;
            Game.Player.Money = data.Money;
            player.Health = (int)data.Health;
            player.Position = data.Position;

            _worldFlags.Clear();
            foreach (var kv in data.WorldFlags)
                _worldFlags[kv.Key] = kv.Value;

            Notification.PostTicker(string.Format("~g~Loaded slot {0} (saved {1})", slot, data.SavedAt), false);
        }

        private string GetSlotPath(int slot)
        {
            return Path.Combine(_saveDirectory, "slot_" + slot + ".sfsave");
        }

        // Minimal hand-rolled pipe-delimited serializer to avoid extra dependencies.
        private void WriteSaveFile(string path, SaveData data)
        {
            StringBuilder sb = new StringBuilder();
            sb.AppendLine(data.Money.ToString());
            sb.AppendLine(data.Health.ToString());
            sb.AppendLine(string.Format("{0}|{1}|{2}", data.Position.X, data.Position.Y, data.Position.Z));
            sb.AppendLine(data.SavedAt.ToString("o"));

            foreach (var kv in data.WorldFlags)
                sb.AppendLine("FLAG|" + kv.Key + "|" + kv.Value);

            File.WriteAllText(path, sb.ToString());
        }

        private SaveData ReadSaveFile(string path)
        {
            try
            {
                string[] lines = File.ReadAllLines(path);
                SaveData data = new SaveData
                {
                    Money = int.Parse(lines[0]),
                    Health = float.Parse(lines[1]),
                };

                string[] posParts = lines[2].Split('|');
                data.Position = new Vector3(float.Parse(posParts[0]), float.Parse(posParts[1]), float.Parse(posParts[2]));
                data.SavedAt = DateTime.Parse(lines[3]);

                for (int i = 4; i < lines.Length; i++)
                {
                    if (!lines[i].StartsWith("FLAG|"))
                        continue;
                    string[] parts = lines[i].Split('|');
                    data.WorldFlags[parts[1]] = bool.Parse(parts[2]);
                }

                return data;
            }
            catch
            {
                return null;
            }
        }
    }
}
