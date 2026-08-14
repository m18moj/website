/*
 * ScriptForge — Banner Collection & Respawn Beacon
 * Pack: Apex Legends Pack | Category: Systems
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Collectible squadmate banners paired with a respawn-beacon interaction flow to bring fallen teammates back.
 *
 * Standalone Unity template for building a similar system in your own game —
 * not a modification of any existing commercial title.
 */

using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;

[Serializable]
public struct SquadBanner
{
    public string ownerId;
    public string ownerName;
    public float capturedTimestamp;
}

/// Manages picking up fallen squadmates' banners and redeeming them at a respawn beacon.
public class BannerCollectionRespawnBeacon : MonoBehaviour
{
    [Header("Beacon Settings")]
    [SerializeField] private float respawnChannelSeconds = 8f;
    [SerializeField] private int maxCarriedBanners = 3;

    private readonly List<SquadBanner> carriedBanners = new List<SquadBanner>();
    private bool beaconInUse;

    public event Action<SquadBanner> OnBannerCollected;
    public event Action<string> OnSquadmateRespawnQueued;
    public event Action<string> OnSquadmateRespawned;
    public event Action OnRespawnCancelled;

    public IReadOnlyList<SquadBanner> CarriedBanners => carriedBanners.AsReadOnly();

    /// Called when the player walks over a downed/eliminated squadmate's banner.
    public bool CollectBanner(string ownerId, string ownerName)
    {
        if (carriedBanners.Count >= maxCarriedBanners) return false;

        var banner = new SquadBanner
        {
            ownerId = ownerId,
            ownerName = ownerName,
            capturedTimestamp = Time.time
        };

        carriedBanners.Add(banner);
        OnBannerCollected?.Invoke(banner);
        return true;
    }

    /// Begins the redemption channel at a beacon for a specific held banner. Returns false if already busy or banner missing.
    public bool TryUseBeacon(string ownerId, MonoBehaviour coroutineHost)
    {
        if (beaconInUse) return false;

        int index = carriedBanners.FindIndex(b => b.ownerId == ownerId);
        if (index < 0) return false;

        coroutineHost.StartCoroutine(RespawnRoutine(index));
        return true;
    }

    private IEnumerator RespawnRoutine(int bannerIndex)
    {
        beaconInUse = true;
        SquadBanner banner = carriedBanners[bannerIndex];
        OnSquadmateRespawnQueued?.Invoke(banner.ownerName);

        float elapsed = 0f;
        while (elapsed < respawnChannelSeconds)
        {
            // A real implementation would break out early here if the channel is interrupted
            // (player takes damage, moves too far from the beacon, etc.) and call CancelRespawn().
            elapsed += Time.deltaTime;
            yield return null;
        }

        carriedBanners.RemoveAt(bannerIndex);
        beaconInUse = false;
        OnSquadmateRespawned?.Invoke(banner.ownerName);
    }

    /// Interrupts an in-progress respawn channel, e.g. because the channeling player took damage.
    public void CancelRespawn()
    {
        if (!beaconInUse) return;
        beaconInUse = false;
        OnRespawnCancelled?.Invoke();
    }

    /// Banners expire and should be cleared once a match ends or the squad is fully eliminated.
    public void ClearAllBanners()
    {
        carriedBanners.Clear();
    }
}
