/*
 * ScripForge — Bounty Hunter Contract Board
 * Pack: GTA V Pack | Category: Missions
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * A contract board listing wanted NPC targets with capture-or-kill objectives and scaling payouts.
 *
 * Written for single-player use via ScriptHookVDotNet — not for GTA Online.
 */

using System;
using System.Collections.Generic;
using GTA;
using GTA.Math;
using GTA.Native;
using GTA.UI;

namespace ScripForge.Missions
{
    internal enum ContractState
    {
        Posted,
        Active,
        Complete,
    }

    internal class BountyContract
    {
        public string TargetName;
        public int Difficulty;          // 1-5, scales payout and target toughness
        public bool AllowKill;          // if false, target must be captured alive
        public Vector3 SpawnPoint;
        public ContractState State;
        public Ped TargetPed;
        public Blip TargetBlip;
        public int BasePayout;

        public BountyContract(string name, int difficulty, bool allowKill, Vector3 spawn, int basePayout)
        {
            TargetName = name;
            Difficulty = difficulty;
            AllowKill = allowKill;
            SpawnPoint = spawn;
            BasePayout = basePayout;
            State = ContractState.Posted;
        }
    }

    /// <summary>
    /// A fixed board of bounty postings. Accepting one from the board marker spawns the
    /// target at a fixed location with a tracking blip; kills or captures (target ped
    /// knocked out/cuffed via melee takedown while wanted-alive) resolve the contract for
    /// a payout that scales with difficulty and the alive-vs-dead requirement.
    /// </summary>
    public class BountyHunterContractBoard : Script
    {
        private readonly Vector3 _boardLocation = new Vector3(440.0f, -980.0f, 30.0f);
        private const float InteractionRadius = 2.5f;

        private readonly List<BountyContract> _contracts = new List<BountyContract>
        {
            new BountyContract("Marco 'Two-Time' Delgado", 1, true, new Vector3(310.0f, -1450.0f, 29.0f), 4000),
            new BountyContract("Ruthie Cassano", 3, false, new Vector3(-1100.0f, -1550.0f, 4.0f), 9000),
            new BountyContract("Desmond 'Ratchet' Cole", 5, true, new Vector3(2000.0f, 3050.0f, 47.0f), 18000),
        };

        private BountyContract _activeContract;
        private Blip _boardBlip;

        public BountyHunterContractBoard()
        {
            Tick += OnTick;
            KeyDown += OnKeyDown;

            _boardBlip = World.CreateBlip(_boardLocation);
            _boardBlip.Sprite = BlipSprite.ArmoryBlip;
            _boardBlip.Color = BlipColor.Orange;
            _boardBlip.Name = "Bounty Board";
        }

        private void OnTick(object sender, EventArgs e)
        {
            if (_activeContract == null)
                return;

            CheckContractResolution();
        }

        private void OnKeyDown(object sender, KeyEventArgs e)
        {
            if (e.KeyCode != System.Windows.Forms.Keys.F9)
                return;

            if (Game.Player.Character.Position.DistanceTo(_boardLocation) > InteractionRadius)
                return;

            if (_activeContract != null)
            {
                Notification.PostTicker("You already have an active contract: " + _activeContract.TargetName, false);
                return;
            }

            BountyContract next = GetNextPostedContract();
            if (next == null)
            {
                Notification.PostTicker("No contracts left on the board.", false);
                return;
            }

            AcceptContract(next);
        }

        private BountyContract GetNextPostedContract()
        {
            foreach (var c in _contracts)
            {
                if (c.State == ContractState.Posted)
                    return c;
            }
            return null;
        }

        private void AcceptContract(BountyContract contract)
        {
            Model model = new Model("mp_m_freemode_01");
            model.Request(1000);

            Ped target = World.CreatePed(model, contract.SpawnPoint);
            if (target == null)
            {
                Notification.PostTicker("~r~Failed to spawn target, try again.", false);
                return;
            }

            target.IsPersistent = true;
            // Tougher contracts get proportionally more health and combat ability.
            target.MaxHealth = 100 + contract.Difficulty * 60;
            target.Health = target.MaxHealth;
            target.Accuracy = Math.Min(90, 30 + contract.Difficulty * 10);
            Function.Call(Hash.SET_PED_COMBAT_ABILITY, target, Math.Min(2, contract.Difficulty / 2));

            Blip blip = target.AddBlip();
            blip.Sprite = BlipSprite.Enemy;
            blip.Color = BlipColor.Red;
            blip.Name = contract.TargetName;
            blip.ShowRoute = true;

            contract.TargetPed = target;
            contract.TargetBlip = blip;
            contract.State = ContractState.Active;
            _activeContract = contract;

            string objective = contract.AllowKill ? "kill or capture" : "capture ALIVE — do not kill";
            Notification.PostTicker(string.Format("~y~Contract accepted: {0} ({1})", contract.TargetName, objective), false);
        }

        private void CheckContractResolution()
        {
            Ped target = _activeContract.TargetPed;
            if (target == null || !target.Exists())
                return;

            bool dead = target.IsDead;
            bool cuffed = target.Exists() && Function.Call<bool>(Hash.IS_PED_CUFFED, target);
            bool knockedOut = target.Exists() && Function.Call<bool>(Hash.IS_PED_INJURED, target) && !dead;

            if (!dead && !cuffed && !knockedOut)
                return;

            if (dead && !_activeContract.AllowKill)
            {
                Notification.PostTicker("~r~Target was supposed to be taken alive. Contract voided, no payout.", false);
                ResolveContract(0);
                return;
            }

            // Alive captures (cuffed or knocked out) pay a premium over a straight kill.
            float aliveBonus = (cuffed || knockedOut) ? 1.4f : 1.0f;
            int payout = (int)(_activeContract.BasePayout * aliveBonus);
            Game.Player.Money += payout;
            Notification.PostTicker(string.Format("~g~Contract complete: {0} — ${1}", _activeContract.TargetName, payout), false);
            ResolveContract(payout);
        }

        private void ResolveContract(int payout)
        {
            if (_activeContract.TargetBlip != null && _activeContract.TargetBlip.Exists())
                _activeContract.TargetBlip.Remove();

            _activeContract.State = ContractState.Complete;
            _activeContract = null;
        }
    }
}
