/*
 * ScripForge — Drug Trafficking Supply Chain
 * Pack: GTA V Pack | Category: Economy
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * A source-to-sell supply loop with product quality, route risk scoring, and police-interdiction odds.
 *
 * Written for single-player use via ScriptHookVDotNet — not for GTA Online.
 */

using System;
using System.Collections.Generic;
using GTA;
using GTA.Math;
using GTA.Native;
using GTA.UI;

namespace ScripForge.Economy
{
    internal enum RouteRisk
    {
        Low,
        Medium,
        High,
    }

    internal class SupplyRoute
    {
        public string Name;
        public Vector3 SourcePoint;
        public Vector3 SellPoint;
        public RouteRisk Risk;
        public int BasePricePerUnit;

        public SupplyRoute(string name, Vector3 source, Vector3 sell, RouteRisk risk, int basePrice)
        {
            Name = name;
            SourcePoint = source;
            SellPoint = sell;
            Risk = risk;
            BasePricePerUnit = basePrice;
        }
    }

    /// <summary>
    /// Player picks up a batch of product at a source point, then hauls it across the city
    /// to a sell point. Product quality decays over transit time and rough driving, route
    /// risk plus current wanted level feed an interdiction roll on a timer, and the payout
    /// at sale scales off both remaining quality and how dangerous the route was.
    /// </summary>
    public class DrugTraffickingSupplyChain : Script
    {
        private readonly List<SupplyRoute> _routes = new List<SupplyRoute>
        {
            new SupplyRoute("Sandy Shores Run", new Vector3(1980.0f, 3740.0f, 32.0f), new Vector3(120.0f, -1290.0f, 29.0f), RouteRisk.Medium, 180),
            new SupplyRoute("Paleto Backroad", new Vector3(-450.0f, 6020.0f, 31.0f), new Vector3(-1100.0f, -1500.0f, 4.0f), RouteRisk.Low, 120),
            new SupplyRoute("Grove Street Pipeline", new Vector3(90.0f, -1950.0f, 21.0f), new Vector3(-670.0f, -930.0f, 20.0f), RouteRisk.High, 260),
        };

        private const float InteractionRadius = 3.0f;
        private const int UnitsPerRun = 20;

        private SupplyRoute _activeRoute;
        private bool _carryingProduct;
        private float _quality = 1.0f;
        private DateTime _pickupTime;
        private DateTime _nextInterdictionCheck = DateTime.MinValue;
        private readonly Random _rng = new Random();

        public DrugTraffickingSupplyChain()
        {
            Tick += OnTick;
            KeyDown += OnKeyDown;

            foreach (var route in _routes)
            {
                Blip source = World.CreateBlip(route.SourcePoint);
                source.Sprite = BlipSprite.Drugs;
                source.Color = BlipColor.Yellow;
                source.Name = route.Name + " (Pickup)";
            }
        }

        private void OnTick(object sender, EventArgs e)
        {
            if (!_carryingProduct)
                return;

            DegradeQuality();
            RunInterdictionCheck();
        }

        private void OnKeyDown(object sender, KeyEventArgs e)
        {
            if (e.KeyCode != System.Windows.Forms.Keys.F6)
                return;

            if (!_carryingProduct)
                TryPickUp();
            else
                TrySell();
        }

        private void TryPickUp()
        {
            Vector3 playerPos = Game.Player.Character.Position;
            foreach (var route in _routes)
            {
                if (playerPos.DistanceTo(route.SourcePoint) > InteractionRadius)
                    continue;

                _activeRoute = route;
                _carryingProduct = true;
                _quality = 1.0f;
                _pickupTime = DateTime.Now;
                _nextInterdictionCheck = DateTime.Now.AddSeconds(20);
                Notification.PostTicker("~y~Picked up " + UnitsPerRun + " units on " + route.Name, false);
                return;
            }
        }

        private void TrySell()
        {
            if (_activeRoute == null)
                return;

            Vector3 playerPos = Game.Player.Character.Position;
            if (playerPos.DistanceTo(_activeRoute.SellPoint) > InteractionRadius)
            {
                Notification.PostTicker("Get to the sell point on " + _activeRoute.Name + " first.", false);
                return;
            }

            // Payout rewards both surviving quality and the extra danger of riskier routes.
            float riskMultiplier = RiskPayoutMultiplier(_activeRoute.Risk);
            int payout = (int)(UnitsPerRun * _activeRoute.BasePricePerUnit * _quality * riskMultiplier);

            Game.Player.Money += payout;
            Notification.PostTicker(string.Format("~g~Sold batch for ${0} (quality {1}%)", payout, (int)(_quality * 100)), false);

            _carryingProduct = false;
            _activeRoute = null;
        }

        private void DegradeQuality()
        {
            // Quality falls off with elapsed transit time, faster on rougher (higher risk) routes.
            double minutesElapsed = (DateTime.Now - _pickupTime).TotalMinutes;
            float decayRate = _activeRoute.Risk == RouteRisk.High ? 0.03f : _activeRoute.Risk == RouteRisk.Medium ? 0.02f : 0.012f;
            _quality = Math.Max(0.1f, 1.0f - (float)(minutesElapsed * decayRate));

            Ped player = Game.Player.Character;
            if (player.IsInVehicle() && player.CurrentVehicle.Speed > 35f)
            {
                // Reckless driving with a live shipment shakes the product loose faster.
                _quality = Math.Max(0.1f, _quality - 0.001f);
            }
        }

        private void RunInterdictionCheck()
        {
            if (DateTime.Now < _nextInterdictionCheck)
                return;

            _nextInterdictionCheck = DateTime.Now.AddSeconds(20);

            int wantedStars = Game.Player.WantedLevel;
            float riskBase = _activeRoute.Risk == RouteRisk.High ? 0.22f : _activeRoute.Risk == RouteRisk.Medium ? 0.12f : 0.05f;
            float chance = riskBase + wantedStars * 0.05f;

            if (_rng.NextDouble() < chance)
            {
                Notification.PostTicker("~r~Police got a tip on your shipment!", false);
                Function.Call(Hash.SET_PLAYER_WANTED_LEVEL, Game.Player, Math.Min(5, wantedStars + 2), false);
                Function.Call(Hash.SET_PLAYER_WANTED_LEVEL_NOW, Game.Player, false);
                _quality = Math.Max(0.1f, _quality - 0.25f);
            }
        }

        private float RiskPayoutMultiplier(RouteRisk risk)
        {
            switch (risk)
            {
                case RouteRisk.High:
                    return 1.6f;
                case RouteRisk.Medium:
                    return 1.25f;
                default:
                    return 1.0f;
            }
        }
    }
}
