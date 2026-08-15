/*
 * ScripForge — Combat Record & Stat Tracking
 * Pack: Call of Duty Pack | Category: Systems
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Tracks persistent per-weapon and per-mode combat stats across sessions, with JSON save/load.
 *
 * Standalone Unity template for building a similar system in your own game —
 * not a modification of any existing commercial title.
 */

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEngine;

namespace ScripForge.Systems
{
    [Serializable]
    public class WeaponStatLine
    {
        public string weaponId;
        public int kills;
        public int shotsFired;
        public int shotsHit;
        public int headshots;

        public float Accuracy => shotsFired == 0 ? 0f : (float)shotsHit / shotsFired;
    }

    [Serializable]
    public class ModeStatLine
    {
        public string modeId;
        public int matchesPlayed;
        public int wins;
        public int losses;
        public int kills;
        public int deaths;

        public float KdRatio => deaths == 0 ? kills : (float)kills / deaths;
        public float WinRate => matchesPlayed == 0 ? 0f : (float)wins / matchesPlayed;
    }

    [Serializable]
    internal class CombatRecordSaveData
    {
        public List<WeaponStatLine> weaponStats = new List<WeaponStatLine>();
        public List<ModeStatLine> modeStats = new List<ModeStatLine>();
    }

    /// <summary>
    /// Accumulates per-weapon and per-game-mode combat statistics during play and persists them
    /// to disk as JSON so career stats survive across sessions. Attach to a persistent manager object.
    /// </summary>
    public class CombatRecordStatTracking : MonoBehaviour
    {
        [SerializeField] private string saveFileName = "combat_record.json";

        private CombatRecordSaveData _data = new CombatRecordSaveData();

        public event Action OnRecordUpdated;

        private string SavePath => Path.Combine(Application.persistentDataPath, saveFileName);

        private void Awake()
        {
            LoadRecord();
        }

        private WeaponStatLine GetOrCreateWeaponLine(string weaponId)
        {
            var line = _data.weaponStats.FirstOrDefault(w => w.weaponId == weaponId);
            if (line == null)
            {
                line = new WeaponStatLine { weaponId = weaponId };
                _data.weaponStats.Add(line);
            }
            return line;
        }

        private ModeStatLine GetOrCreateModeLine(string modeId)
        {
            var line = _data.modeStats.FirstOrDefault(m => m.modeId == modeId);
            if (line == null)
            {
                line = new ModeStatLine { modeId = modeId };
                _data.modeStats.Add(line);
            }
            return line;
        }

        public void RecordShotFired(string weaponId) => GetOrCreateWeaponLine(weaponId).shotsFired++;

        public void RecordShotHit(string weaponId, bool wasHeadshot)
        {
            var line = GetOrCreateWeaponLine(weaponId);
            line.shotsHit++;
            if (wasHeadshot) line.headshots++;
        }

        public void RecordKill(string weaponId, string modeId)
        {
            GetOrCreateWeaponLine(weaponId).kills++;
            GetOrCreateModeLine(modeId).kills++;
            OnRecordUpdated?.Invoke();
        }

        public void RecordDeath(string modeId) => GetOrCreateModeLine(modeId).deaths++;

        /// <summary>Call once at match end to roll up win/loss and match count for the played mode.</summary>
        public void RecordMatchResult(string modeId, bool didWin)
        {
            var line = GetOrCreateModeLine(modeId);
            line.matchesPlayed++;
            if (didWin) line.wins++;
            else line.losses++;
            OnRecordUpdated?.Invoke();
            SaveRecord();
        }

        public WeaponStatLine GetWeaponStats(string weaponId) => GetOrCreateWeaponLine(weaponId);
        public ModeStatLine GetModeStats(string modeId) => GetOrCreateModeLine(modeId);

        public void SaveRecord()
        {
            try
            {
                File.WriteAllText(SavePath, JsonUtility.ToJson(_data, true));
            }
            catch (Exception e)
            {
                Debug.LogError($"CombatRecordStatTracking: failed to save — {e.Message}");
            }
        }

        public void LoadRecord()
        {
            if (!File.Exists(SavePath))
            {
                _data = new CombatRecordSaveData();
                return;
            }

            try
            {
                _data = JsonUtility.FromJson<CombatRecordSaveData>(File.ReadAllText(SavePath)) ?? new CombatRecordSaveData();
            }
            catch (Exception e)
            {
                Debug.LogError($"CombatRecordStatTracking: failed to load — {e.Message}");
                _data = new CombatRecordSaveData();
            }
        }
    }
}
