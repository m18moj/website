/*
 * ScripForge — Team Formation & Custom Room Lobby
 * Pack: PUBG Pack | Category: Systems
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Custom-room lobby creation with team-size presets, password gating, and a ready-check flow.
 *
 * Standalone Unity template for building a similar system in your own game —
 * not a modification of any existing commercial title.
 */

using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;

public enum TeamSizePreset { Solo = 1, Duo = 2, Squad = 4 }

[Serializable]
public class LobbyMember
{
    public string playerId;
    public string displayName;
    public int teamIndex;
    public bool isReady;
    public bool isHost;
}

/// Manages a single custom-room lobby: creation, password-gated joining, team-size enforcement,
/// and a countdown ready-check before the match is allowed to launch.
public class TeamFormationCustomRoomLobby : MonoBehaviour
{
    [Header("Room Settings")]
    [SerializeField] private string roomName = "Custom Room";
    [SerializeField] private string roomPassword = "";
    [SerializeField] private TeamSizePreset teamSize = TeamSizePreset.Squad;
    [SerializeField] private int maxTeams = 25;

    [Header("Ready Check")]
    [SerializeField] private float readyCheckCountdownSeconds = 10f;
    [Tooltip("If any player un-readies during the countdown, the countdown is cancelled.")]
    [SerializeField] private bool cancelOnUnready = true;

    public bool IsOpen { get; private set; }
    public bool RoomHasPassword => !string.IsNullOrEmpty(roomPassword);

    public event Action<LobbyMember> OnMemberJoined;
    public event Action<string> OnMemberLeft;
    public event Action OnAllReady;
    public event Action OnReadyCheckCancelled;
    public event Action OnMatchLaunching;

    private readonly List<LobbyMember> members = new List<LobbyMember>();
    private readonly Dictionary<int, int> teamOccupancy = new Dictionary<int, int>();
    private Coroutine readyCheckRoutine;

    public void CreateRoom(string hostPlayerId, string hostDisplayName, string name, string password, TeamSizePreset size)
    {
        roomName = name;
        roomPassword = password ?? "";
        teamSize = size;
        members.Clear();
        teamOccupancy.Clear();
        IsOpen = true;

        LobbyMember host = new LobbyMember
        {
            playerId = hostPlayerId,
            displayName = hostDisplayName,
            teamIndex = 0,
            isHost = true
        };
        members.Add(host);
        teamOccupancy[0] = 1;
        OnMemberJoined?.Invoke(host);
    }

    /// Attempts to join the room; fails on a closed room, wrong password, or a full team space.
    public bool TryJoin(string playerId, string displayName, string enteredPassword, out string failureReason)
    {
        failureReason = null;

        if (!IsOpen) { failureReason = "Room is closed."; return false; }
        if (RoomHasPassword && enteredPassword != roomPassword) { failureReason = "Incorrect password."; return false; }

        int teamIndex = FindOpenTeamSlot();
        if (teamIndex < 0) { failureReason = "Room is full."; return false; }

        LobbyMember member = new LobbyMember
        {
            playerId = playerId,
            displayName = displayName,
            teamIndex = teamIndex,
            isHost = false
        };
        members.Add(member);
        teamOccupancy[teamIndex] = teamOccupancy.GetValueOrDefault(teamIndex) + 1;

        OnMemberJoined?.Invoke(member);
        return true;
    }

    private int FindOpenTeamSlot()
    {
        for (int team = 0; team < maxTeams; team++)
        {
            int occupants = teamOccupancy.GetValueOrDefault(team);
            if (occupants < (int)teamSize) return team;
        }
        return -1;
    }

    public void Leave(string playerId)
    {
        int index = members.FindIndex(m => m.playerId == playerId);
        if (index < 0) return;

        LobbyMember member = members[index];
        teamOccupancy[member.teamIndex] = Mathf.Max(0, teamOccupancy.GetValueOrDefault(member.teamIndex) - 1);
        members.RemoveAt(index);
        OnMemberLeft?.Invoke(playerId);

        if (readyCheckRoutine != null && cancelOnUnready)
        {
            StopCoroutine(readyCheckRoutine);
            readyCheckRoutine = null;
            OnReadyCheckCancelled?.Invoke();
        }
    }

    public void SetReady(string playerId, bool ready)
    {
        LobbyMember member = members.Find(m => m.playerId == playerId);
        if (member == null) return;

        member.isReady = ready;

        if (!ready && readyCheckRoutine != null && cancelOnUnready)
        {
            StopCoroutine(readyCheckRoutine);
            readyCheckRoutine = null;
            OnReadyCheckCancelled?.Invoke();
            return;
        }

        if (ready && AllMembersReady() && readyCheckRoutine == null)
        {
            readyCheckRoutine = StartCoroutine(ReadyCheckCountdown());
        }
    }

    private bool AllMembersReady()
    {
        if (members.Count == 0) return false;
        foreach (LobbyMember member in members)
        {
            if (!member.isReady) return false;
        }
        return true;
    }

    private IEnumerator ReadyCheckCountdown()
    {
        OnAllReady?.Invoke();
        yield return new WaitForSeconds(readyCheckCountdownSeconds);

        if (AllMembersReady())
        {
            IsOpen = false;
            OnMatchLaunching?.Invoke();
        }
        readyCheckRoutine = null;
    }

    public IReadOnlyList<LobbyMember> Members => members;
    public string RoomName => roomName;
}
