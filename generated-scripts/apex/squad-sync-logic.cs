/*
 * ScripForge — Squad Ping & Comms Wheel
 * Pack: Apex Legends Pack | Category: Squad
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * A context-aware ping wheel with squad status sync and enemy-spotted callouts.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using System.Collections.Generic;
using UnrealEngine;

public enum PingType { Generic, Enemy, Loot, Ammo, Rotate, Danger, NeedHelp }

[Serializable]
public struct PingData
{
    public PingType type;
    public Vector3 worldPosition;
    public int squadMemberId;
    public float timestamp;
}

[Serializable]
public class SquadMemberStatus
{
    public int memberId;
    public string displayName;
    public float healthFraction = 1f;
    public bool isDowned;
    public bool isAlive = true;
    public Vector3 lastKnownPosition;
}

public class SquadPingCommsWheel : MonoBehaviour
{
    [SerializeField] private List<SquadMemberStatus> squadRoster = new List<SquadMemberStatus>();
    [SerializeField] private float pingCooldownSeconds = 1.5f;
    [SerializeField] private float enemyPingBroadcastRadius = 40f;

    public event Action<PingData> OnPingBroadcast;
    public event Action<SquadMemberStatus> OnSquadStatusChanged;

    private float lastPingTime = -999f;
    private readonly List<PingData> activePings = new List<PingData>();

    /// Raises a context-aware ping based on what the crosshair/raycast is currently over.
    public bool RaisePing(PingType desiredType, Vector3 hitPosition, int fromMemberId, bool hitEnemy = false)
    {
        if (Time.time - lastPingTime < pingCooldownSeconds)
        {
            return false;
        }

        PingType resolvedType = ResolveContextualType(desiredType, hitEnemy);
        var ping = new PingData
        {
            type = resolvedType,
            worldPosition = hitPosition,
            squadMemberId = fromMemberId,
            timestamp = Time.time
        };

        activePings.Add(ping);
        lastPingTime = Time.time;
        OnPingBroadcast?.Invoke(ping);

        if (resolvedType == PingType.Enemy)
        {
            BroadcastEnemySpotted(ping);
        }

        return true;
    }

    /// Enemy call-outs escalate danger/generic pings automatically when aimed at a hostile.
    private PingType ResolveContextualType(PingType requested, bool hitEnemy)
    {
        if (hitEnemy && (requested == PingType.Generic || requested == PingType.Danger))
        {
            return PingType.Enemy;
        }
        return requested;
    }

    private void BroadcastEnemySpotted(PingData ping)
    {
        foreach (var member in squadRoster)
        {
            if (!member.isAlive) continue;
            float distance = Vector3.Distance(member.lastKnownPosition, ping.worldPosition);
            if (distance <= enemyPingBroadcastRadius)
            {
                // In a networked build this would route through an RPC to that member's client.
                Debug.Log($"[SquadComms] {member.displayName} notified of enemy at {ping.worldPosition}");
            }
        }
    }

    /// Syncs a squadmate's live status (health, downed, alive) across the squad HUD.
    public void UpdateSquadStatus(int memberId, float healthFraction, bool isDowned, bool isAlive, Vector3 position)
    {
        var member = squadRoster.Find(m => m.memberId == memberId);
        if (member == null) return;

        member.healthFraction = healthFraction;
        member.isDowned = isDowned;
        member.isAlive = isAlive;
        member.lastKnownPosition = position;

        OnSquadStatusChanged?.Invoke(member);

        if (isDowned && healthFraction <= 0f)
        {
            RaisePing(PingType.NeedHelp, position, memberId);
        }
    }

    public IReadOnlyList<SquadMemberStatus> GetRoster() => squadRoster;

    /// Clears pings older than the given lifetime, intended to be called from a periodic tick.
    public void PruneExpiredPings(float lifetimeSeconds)
    {
        activePings.RemoveAll(p => Time.time - p.timestamp > lifetimeSeconds);
    }
}
