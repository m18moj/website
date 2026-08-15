/*
 * ScripForge — Stock Market & Investment System
 * Pack: GTA V Pack | Category: Economy
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Fluctuating stock market with buy/sell orders and event-driven price swings.
 *
 * Written for single-player use via ScriptHookVDotNet — not for GTA Online.
 */

using System;
using System.Collections.Generic;
using System.Linq;
using GTA;
using GTA.Native;

namespace ScripForge.Economy
{
    /// <summary>
    /// A standalone stock market simulation independent of the vanilla LCN/BAWSAQ system.
    /// Prices drift randomly each tick and occasionally spike/crash from scripted "news events".
    /// Player holdings are tracked in-memory and can be bought/sold against in-game cash.
    /// </summary>
    public class StockMarketInvestmentSystem : Script
    {
        private class Stock
        {
            public string Ticker;
            public float Price;
            public float Volatility; // percent drift per tick, roughly
        }

        private class Holding
        {
            public string Ticker;
            public int Shares;
            public float AverageBuyPrice;
        }

        private readonly List<Stock> _market = new List<Stock>
        {
            new Stock { Ticker = "FRUIT", Price = 145.20f, Volatility = 0.015f },
            new Stock { Ticker = "BILKN", Price = 62.75f,  Volatility = 0.03f },
            new Stock { Ticker = "REDWD", Price = 310.00f, Volatility = 0.01f },
            new Stock { Ticker = "VAPID", Price = 88.40f,  Volatility = 0.025f },
        };

        private readonly List<Holding> _portfolio = new List<Holding>();
        private readonly Random _rng = new Random();

        private DateTime _lastTick = DateTime.Now;
        private const double TickIntervalSeconds = 20.0;
        private const double NewsEventChance = 0.15;

        public StockMarketInvestmentSystem()
        {
            Tick += OnTick;
        }

        private void OnTick(object sender, EventArgs e)
        {
            if ((DateTime.Now - _lastTick).TotalSeconds < TickIntervalSeconds)
                return;

            _lastTick = DateTime.Now;
            DriftPrices();

            if (_rng.NextDouble() < NewsEventChance)
                TriggerNewsEvent();
        }

        private void DriftPrices()
        {
            foreach (Stock stock in _market)
            {
                float changePercent = ((float)_rng.NextDouble() * 2f - 1f) * stock.Volatility;
                stock.Price = Math.Max(1f, stock.Price * (1f + changePercent));
            }
        }

        private void TriggerNewsEvent()
        {
            Stock target = _market[_rng.Next(_market.Count)];
            bool positive = _rng.NextDouble() > 0.5;
            float swing = positive ? 0.12f : -0.15f;

            target.Price = Math.Max(1f, target.Price * (1f + swing));

            string headline = positive
                ? $"~g~{target.Ticker} surges~w~ on positive earnings report."
                : $"~r~{target.Ticker} tumbles~w~ after scandal breaks.";

            GTA.UI.Notification.PostTicker(headline, false);
        }

        /// <summary>Buys the given number of shares if the player has enough cash.</summary>
        public bool Buy(string ticker, int shares)
        {
            Stock stock = _market.FirstOrDefault(s => s.Ticker == ticker);
            if (stock == null || shares <= 0)
                return false;

            int cost = (int)(stock.Price * shares);
            int cash = Function.Call<int>(Hash.GET_PLAYER_MONEY, Game.Player, 0);
            if (cash < cost)
            {
                GTA.UI.Notification.PostTicker("Insufficient funds for this trade.", false);
                return false;
            }

            Function.Call(Hash.SET_PLAYER_MONEY, Game.Player, cash - cost, 0);

            Holding holding = _portfolio.FirstOrDefault(h => h.Ticker == ticker);
            if (holding == null)
            {
                _portfolio.Add(new Holding { Ticker = ticker, Shares = shares, AverageBuyPrice = stock.Price });
            }
            else
            {
                float totalCost = holding.AverageBuyPrice * holding.Shares + stock.Price * shares;
                holding.Shares += shares;
                holding.AverageBuyPrice = totalCost / holding.Shares;
            }

            GTA.UI.Notification.PostTicker($"Bought {shares}x {ticker} @ ${stock.Price:0.00}", false);
            return true;
        }

        /// <summary>Sells shares from the player's portfolio at the current market price.</summary>
        public bool Sell(string ticker, int shares)
        {
            Holding holding = _portfolio.FirstOrDefault(h => h.Ticker == ticker);
            Stock stock = _market.FirstOrDefault(s => s.Ticker == ticker);
            if (holding == null || stock == null || holding.Shares < shares)
                return false;

            int proceeds = (int)(stock.Price * shares);
            int cash = Function.Call<int>(Hash.GET_PLAYER_MONEY, Game.Player, 0);
            Function.Call(Hash.SET_PLAYER_MONEY, Game.Player, cash + proceeds, 0);

            holding.Shares -= shares;
            if (holding.Shares <= 0)
                _portfolio.Remove(holding);

            GTA.UI.Notification.PostTicker($"Sold {shares}x {ticker} @ ${stock.Price:0.00}", false);
            return true;
        }

        /// <summary>Returns the current market price for a ticker, or -1 if unknown.</summary>
        public float GetPrice(string ticker)
        {
            Stock stock = _market.FirstOrDefault(s => s.Ticker == ticker);
            return stock?.Price ?? -1f;
        }
    }
}
