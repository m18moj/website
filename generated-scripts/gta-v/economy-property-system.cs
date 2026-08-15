/*
 * ScripForge — Property Ownership & Income
 * Pack: GTA V Pack | Category: Economy
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Lets the player purchase properties that generate passive income over time and store vehicles in linked garages.
 *
 * Written for single-player use via ScriptHookVDotNet — not for GTA Online.
 */

using System;
using System.Collections.Generic;
using GTA;
using GTA.Math;
using GTA.UI;

namespace ScripForge.Economy
{
    internal class OwnedProperty
    {
        public string Name;
        public Vector3 EntryPoint;
        public int Price;
        public int IncomePerTick;
        public bool Owned;
        public DateTime LastPayout;
        public List<Vehicle> GarageVehicles = new List<Vehicle>();
        public int GarageCapacity;

        public OwnedProperty(string name, Vector3 entry, int price, int income, int capacity)
        {
            Name = name;
            EntryPoint = entry;
            Price = price;
            IncomePerTick = income;
            GarageCapacity = capacity;
            Owned = false;
        }
    }

    /// <summary>
    /// Simple property investment loop: walk up to a marker, buy the property if you can
    /// afford it, then collect passive income on a timer and store vehicles in its garage
    /// slots up to a fixed capacity.
    /// </summary>
    public class EconomyPropertySystem : Script
    {
        private readonly List<OwnedProperty> _properties = new List<OwnedProperty>
        {
            new OwnedProperty("Downtown Apartment", new Vector3(-800.0f, 320.0f, 79.0f), 80000, 250, 2),
            new OwnedProperty("Vinewood Hills Villa", new Vector3(-1200.0f, 500.0f, 120.0f), 400000, 900, 4),
            new OwnedProperty("Docks Warehouse", new Vector3(950.0f, -2100.0f, 30.0f), 150000, 400, 6),
        };

        private const float InteractionRadius = 3.0f;
        private const int IncomeIntervalMinutes = 5;

        public EconomyPropertySystem()
        {
            Tick += OnTick;
            KeyDown += OnKeyDown;
            foreach (var p in _properties)
            {
                Blip blip = World.CreateBlip(p.EntryPoint);
                blip.Sprite = BlipSprite.PoliceStation;
                blip.Color = BlipColor.Green;
                blip.Name = p.Name;
            }
        }

        private void OnTick(object sender, EventArgs e)
        {
            CollectPassiveIncome();
        }

        private void OnKeyDown(object sender, KeyEventArgs e)
        {
            if (e.KeyCode != System.Windows.Forms.Keys.F7)
                return;

            OwnedProperty nearby = GetNearbyProperty();
            if (nearby == null)
                return;

            if (!nearby.Owned)
            {
                TryPurchase(nearby);
            }
            else
            {
                TryStoreCurrentVehicle(nearby);
            }
        }

        private OwnedProperty GetNearbyProperty()
        {
            Vector3 playerPos = Game.Player.Character.Position;
            foreach (var p in _properties)
            {
                if (playerPos.DistanceTo(p.EntryPoint) <= InteractionRadius)
                    return p;
            }
            return null;
        }

        private void TryPurchase(OwnedProperty property)
        {
            if (Game.Player.Money < property.Price)
            {
                Notification.PostTicker("~r~Not enough cash to buy " + property.Name, false);
                return;
            }

            Game.Player.Money -= property.Price;
            property.Owned = true;
            property.LastPayout = DateTime.Now;
            Notification.PostTicker("~g~You now own " + property.Name, false);
        }

        private void TryStoreCurrentVehicle(OwnedProperty property)
        {
            Ped player = Game.Player.Character;
            if (!player.IsInVehicle())
            {
                Notification.PostTicker("Get in a vehicle to store it here.", false);
                return;
            }

            if (property.GarageVehicles.Count >= property.GarageCapacity)
            {
                Notification.PostTicker("~r~Garage at " + property.Name + " is full.", false);
                return;
            }

            Vehicle veh = player.CurrentVehicle;
            veh.IsPersistent = true;
            property.GarageVehicles.Add(veh);
            Notification.PostTicker(string.Format("Vehicle stored ({0}/{1}) at {2}",
                property.GarageVehicles.Count, property.GarageCapacity, property.Name), false);
        }

        private void CollectPassiveIncome()
        {
            foreach (var p in _properties)
            {
                if (!p.Owned)
                    continue;

                if ((DateTime.Now - p.LastPayout).TotalMinutes < IncomeIntervalMinutes)
                    continue;

                p.LastPayout = DateTime.Now;
                Game.Player.Money += p.IncomePerTick;
                Notification.PostTicker(string.Format("~g~${0} income from {1}", p.IncomePerTick, p.Name), false);
            }
        }
    }
}
