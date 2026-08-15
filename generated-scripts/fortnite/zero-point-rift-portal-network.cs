/*
 * ScripForge — Zero Point Rift Portal Network
 * Pack: Fortnite Pack | Category: World
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Placed rift-portal pairs with linked teleport pathing and a per-portal cooldown to limit reuse.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using System.Collections.Generic;
using UnrealEngine;

namespace ScripForge.Fortnite.World
{
    // Placed in the level on a rift-portal actor. Two portals sharing the same LinkId form a bonded pair.
    [RequireComponent(typeof(Collider))]
    public class RiftPortalNode : MonoBehaviour
    {
        public event Action<GameObject> OnTeleported;

        [Header("Link Settings")]
        [SerializeField] private string _linkId = "rift_a";
        [SerializeField] private Transform _exitPoint;
        [SerializeField] private float _exitVelocityMultiplier = 1.1f;

        [Header("Reuse Cooldown")]
        [SerializeField] private float _cooldownSeconds = 4f;
        [SerializeField] private LayerMask _travelerMask;

        private float _lastUseTime = -999f;
        private RiftPortalNode _linkedPartner;

        public string LinkId => _linkId;
        public Transform ExitPoint => _exitPoint != null ? _exitPoint : transform;
        public bool IsOnCooldown => Time.time - _lastUseTime < _cooldownSeconds;

        private void Start()
        {
            RiftPortalNetwork.Instance.Register(this);
        }

        private void OnDestroy()
        {
            if (RiftPortalNetwork.Instance != null)
            {
                RiftPortalNetwork.Instance.Unregister(this);
            }
        }

        public void BindPartner(RiftPortalNode partner)
        {
            _linkedPartner = partner;
        }

        private void OnTriggerEnter(Collider other)
        {
            if (((1 << other.gameObject.layer) & _travelerMask) == 0) return;
            if (IsOnCooldown || _linkedPartner == null || _linkedPartner.IsOnCooldown) return;

            TeleportTraveler(other.gameObject);
        }

        // Moves the traveler to the partner portal's exit point and preserves a scaled version of incoming momentum.
        private void TeleportTraveler(GameObject traveler)
        {
            CharacterController cc = traveler.GetComponent<CharacterController>();
            Vector3 incomingVelocity = cc != null ? cc.velocity : Vector3.zero;

            if (cc != null) cc.enabled = false;
            traveler.transform.SetPositionAndRotation(_linkedPartner.ExitPoint.position, _linkedPartner.ExitPoint.rotation);
            if (cc != null) cc.enabled = true;

            Rigidbody rb = traveler.GetComponent<Rigidbody>();
            if (rb != null)
            {
                rb.velocity = _linkedPartner.ExitPoint.forward * incomingVelocity.magnitude * _exitVelocityMultiplier;
            }

            _lastUseTime = Time.time;
            _linkedPartner.NotifyUsedByPartner();

            OnTeleported?.Invoke(traveler);
        }

        // Called on the arrival side so both ends of the pair share a single reuse cooldown window.
        private void NotifyUsedByPartner()
        {
            _lastUseTime = Time.time;
        }
    }

    // Central registry that pairs up placed RiftPortalNode instances sharing the same LinkId.
    public class RiftPortalNetwork : MonoBehaviour
    {
        public static RiftPortalNetwork Instance { get; private set; }

        private readonly Dictionary<string, List<RiftPortalNode>> _pendingByLinkId = new Dictionary<string, List<RiftPortalNode>>();

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }
            Instance = this;
        }

        public void Register(RiftPortalNode node)
        {
            if (!_pendingByLinkId.TryGetValue(node.LinkId, out List<RiftPortalNode> list))
            {
                list = new List<RiftPortalNode>();
                _pendingByLinkId[node.LinkId] = list;
            }

            list.Add(node);

            if (list.Count == 2)
            {
                list[0].BindPartner(list[1]);
                list[1].BindPartner(list[0]);
            }
        }

        public void Unregister(RiftPortalNode node)
        {
            if (_pendingByLinkId.TryGetValue(node.LinkId, out List<RiftPortalNode> list))
            {
                list.Remove(node);
            }
        }
    }
}
