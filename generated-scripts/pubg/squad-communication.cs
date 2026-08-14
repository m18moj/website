/*
 * ScriptForge — Squad Markers & Ping System
 * Pack: PUBG Pack | Category: Squad
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Map-based squad markers, danger pings, and revive-request callouts shared between squadmates.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using System.Collections.Generic;
using UnrealEngine;

public enum PingType { Generic, Enemy, Loot, Danger, ReviveRequest, RegroupHere }

public class SquadPing
{
    public int id;
    public PingType type;
    public Vector3 worldPosition;
    public int senderIndex;
    public float createdAtTime;
    public float lifetimeSeconds;

    public bool IsExpired => Time.time - createdAtTime >= lifetimeSeconds;
}

public class SquadCommunication : MonoBehaviour
{
    [Header("Squad Setup")]
    [SerializeField] private int localSquadmateIndex = 0;
    [SerializeField] private int squadSize = 4;

    [Header("Ping Lifetimes")]
    [SerializeField] private float genericPingLifetime = 8f;
    [SerializeField] private float dangerPingLifetime = 15f;
    [SerializeField] private float reviveRequestLifetime = 20f;

    [Header("Rate Limiting")]
    [Tooltip("Minimum seconds between pings from the same squadmate, to avoid spam.")]
    [SerializeField] private float pingCooldownSeconds = 1.5f;

    public event Action<SquadPing> OnPingCreated;
    public event Action<int> OnPingExpired;

    private readonly List<SquadPing> activePings = new List<SquadPing>();
    private readonly float[] lastPingTimePerMember = new float[8];
    private int nextPingId = 1;

    private void Update()
    {
        for (int i = activePings.Count - 1; i >= 0; i--)
        {
            if (activePings[i].IsExpired)
            {
                OnPingExpired?.Invoke(activePings[i].id);
                activePings.RemoveAt(i);
            }
        }
    }

    /// Attempts to raise a ping from a squad member at a world position. Returns null if rate-limited.
    public SquadPing TryCreatePing(int senderIndex, PingType type, Vector3 worldPosition)
    {
        if (senderIndex < 0 || senderIndex >= lastPingTimePerMember.Length) return null;

        if (Time.time - lastPingTimePerMember[senderIndex] < pingCooldownSeconds)
        {
            return null; // Still on cooldown — ignore spam presses.
        }

        lastPingTimePerMember[senderIndex] = Time.time;

        var ping = new SquadPing
        {
            id = nextPingId++,
            type = type,
            worldPosition = worldPosition,
            senderIndex = senderIndex,
            createdAtTime = Time.time,
            lifetimeSeconds = GetLifetimeForType(type)
        };

        activePings.Add(ping);
        OnPingCreated?.Invoke(ping);
        return ping;
    }

    /// Convenience call for the "need a revive" callout, anchored to the downed squadmate's position.
    public SquadPing RequestRevive(int senderIndex, Vector3 downedPosition)
    {
        return TryCreatePing(senderIndex, PingType.ReviveRequest, downedPosition);
    }

    /// Convenience call for a danger ping, e.g. spotted an enemy squad or vehicle.
    public SquadPing RaiseDangerPing(int senderIndex, Vector3 dangerPosition)
    {
        return TryCreatePing(senderIndex, PingType.Danger, dangerPosition);
    }

    private float GetLifetimeForType(PingType type)
    {
        switch (type)
        {
            case PingType.Danger: return dangerPingLifetime;
            case PingType.ReviveRequest: return reviveRequestLifetime;
            default: return genericPingLifetime;
        }
    }

    public IReadOnlyList<SquadPing> GetActivePings() => activePings;

    /// Returns all currently active pings of a given type, e.g. all outstanding revive requests.
    public List<SquadPing> GetPingsOfType(PingType type)
    {
        var results = new List<SquadPing>();
        foreach (var ping in activePings)
        {
            if (ping.type == type) results.Add(ping);
        }
        return results;
    }
}
