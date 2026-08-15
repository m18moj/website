/*
 * ScripForge — In-Game Phone & Contact Menu
 * Pack: GTA V Pack | Category: Systems
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Phone overlay with a scrollable contacts list that triggers calls, texts, and app sub-menus.
 *
 * Written for single-player use via ScriptHookVDotNet — not for GTA Online.
 */

using System;
using System.Collections.Generic;
using System.Windows.Forms;
using GTA;
using GTA.UI;

namespace ScripForge.Systems
{
    /// <summary>
    /// A lightweight phone UI drawn with the GTA.UI scaleform-free drawing API.
    /// Opens with a hotkey, lets the player scroll through contacts, and "calls" or
    /// "texts" them, each of which fires a custom event other scripts can hook into.
    /// </summary>
    public class InGamePhoneContactMenu : Script
    {
        private class Contact
        {
            public string Name;
            public string CallAction;
            public string TextAction;
        }

        private readonly List<Contact> _contacts = new List<Contact>
        {
            new Contact { Name = "Lester", CallAction = "OpenHeistApp", TextAction = "AskForSetupCost" },
            new Contact { Name = "Simeon", CallAction = "OfferVehicleJob", TextAction = "CheckVehicleBounty" },
            new Contact { Name = "Franklin", CallAction = "RequestBackup", TextAction = "ChitChat" },
            new Contact { Name = "Mechanic", CallAction = "RequestTowTruck", TextAction = "AskRepairCost" },
        };

        private bool _phoneOpen;
        private int _selectedIndex;
        private DateTime _lastInput = DateTime.MinValue;
        private const double InputCooldownSeconds = 0.15;

        public event EventHandler<string> ContactActionTriggered;

        public InGamePhoneContactMenu()
        {
            Tick += OnTick;
            KeyDown += OnKeyDown;
        }

        private void OnTick(object sender, EventArgs e)
        {
            if (!_phoneOpen)
                return;

            DrawPhoneOverlay();
        }

        private void OnKeyDown(object sender, KeyEventArgs e)
        {
            if (e.KeyCode == Keys.P)
            {
                TogglePhone();
                return;
            }

            if (!_phoneOpen)
                return;

            if ((DateTime.Now - _lastInput).TotalSeconds < InputCooldownSeconds)
                return;

            switch (e.KeyCode)
            {
                case Keys.Up:
                    _selectedIndex = (_selectedIndex - 1 + _contacts.Count) % _contacts.Count;
                    _lastInput = DateTime.Now;
                    break;
                case Keys.Down:
                    _selectedIndex = (_selectedIndex + 1) % _contacts.Count;
                    _lastInput = DateTime.Now;
                    break;
                case Keys.Enter:
                    CallSelectedContact();
                    break;
                case Keys.T:
                    TextSelectedContact();
                    break;
                case Keys.Escape:
                    TogglePhone();
                    break;
            }
        }

        private void TogglePhone()
        {
            _phoneOpen = !_phoneOpen;
            Game.Player.Character.FreezePosition = false;

            if (_phoneOpen)
            {
                Screen.ShowSubtitle("~b~Phone opened. Up/Down to browse, Enter to call, T to text, Esc to close.", 2000);
            }
        }

        private void DrawPhoneOverlay()
        {
            float baseX = 0.78f;
            float baseY = 0.30f;
            float lineHeight = 0.035f;

            new TextElement("-- Contacts --", new System.Drawing.PointF(baseX * Screen.Width, (baseY - lineHeight) * Screen.Height), 0.4f).Draw();

            for (int i = 0; i < _contacts.Count; i++)
            {
                string prefix = i == _selectedIndex ? "~b~> " : "~w~  ";
                var pos = new System.Drawing.PointF(baseX * Screen.Width, (baseY + i * lineHeight) * Screen.Height);
                new TextElement(prefix + _contacts[i].Name, pos, 0.4f).Draw();
            }
        }

        private void CallSelectedContact()
        {
            Contact contact = _contacts[_selectedIndex];
            Notification.PostTicker($"Calling {contact.Name}...", false);
            ContactActionTriggered?.Invoke(this, contact.CallAction);
        }

        private void TextSelectedContact()
        {
            Contact contact = _contacts[_selectedIndex];
            Notification.PostTicker($"Texted {contact.Name}.", false);
            ContactActionTriggered?.Invoke(this, contact.TextAction);
        }
    }
}
