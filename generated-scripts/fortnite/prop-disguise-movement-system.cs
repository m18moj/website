/*
 * ScripForge — Prop-Disguise Movement System
 * Pack: Fortnite Pack | Category: Movement
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Prop-mesh disguise mode with restricted movement speed and a break-disguise-on-damage rule.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using System.Collections.Generic;
using UnrealEngine;

namespace ScripForge.Fortnite.Movement
{
    [Serializable]
    public class PropDisguiseDefinition
    {
        public string PropId;
        public Mesh DisguiseMesh;
        public Material DisguiseMaterial;
        public float SpeedMultiplier = 0.4f;
    }

    [RequireComponent(typeof(CharacterController))]
    [RequireComponent(typeof(MeshFilter))]
    [RequireComponent(typeof(MeshRenderer))]
    public class PropDisguiseMovementSystem : MonoBehaviour
    {
        public event Action<PropDisguiseDefinition> OnDisguiseEntered;
        public event Action OnDisguiseBroken;

        [Header("Library")]
        [SerializeField] private List<PropDisguiseDefinition> _propLibrary = new List<PropDisguiseDefinition>();

        [Header("Base Movement")]
        [SerializeField] private float _baseMoveSpeed = 6f;
        [SerializeField] private CharacterController _controller;
        [SerializeField] private MeshFilter _meshFilter;
        [SerializeField] private MeshRenderer _meshRenderer;

        private Mesh _originalMesh;
        private Material _originalMaterial;
        private PropDisguiseDefinition _activeDisguise;

        public bool IsDisguised => _activeDisguise != null;
        public float CurrentMoveSpeed => IsDisguised ? _baseMoveSpeed * _activeDisguise.SpeedMultiplier : _baseMoveSpeed;

        private void Awake()
        {
            if (_controller == null) _controller = GetComponent<CharacterController>();
            if (_meshFilter == null) _meshFilter = GetComponent<MeshFilter>();
            if (_meshRenderer == null) _meshRenderer = GetComponent<MeshRenderer>();

            _originalMesh = _meshFilter.sharedMesh;
            _originalMaterial = _meshRenderer.sharedMaterial;
        }

        private void Update()
        {
            Vector3 input = new Vector3(Input.GetAxis("Horizontal"), 0f, Input.GetAxis("Vertical"));
            Vector3 move = transform.TransformDirection(input.normalized) * CurrentMoveSpeed;
            _controller.SimpleMove(move);
        }

        public bool TryEnterDisguise(string propId)
        {
            if (IsDisguised) return false;

            PropDisguiseDefinition def = _propLibrary.Find(p => p.PropId == propId);
            if (def == null) return false;

            _activeDisguise = def;
            _meshFilter.sharedMesh = def.DisguiseMesh;
            _meshRenderer.sharedMaterial = def.DisguiseMaterial;

            OnDisguiseEntered?.Invoke(def);
            return true;
        }

        // Any incoming damage while disguised immediately reverts the player mesh and clears the movement penalty.
        public void NotifyDamageTaken(float amount)
        {
            if (!IsDisguised || amount <= 0f) return;

            BreakDisguise();
        }

        public void BreakDisguise()
        {
            if (!IsDisguised) return;

            _activeDisguise = null;
            _meshFilter.sharedMesh = _originalMesh;
            _meshRenderer.sharedMaterial = _originalMaterial;

            OnDisguiseBroken?.Invoke();
        }
    }
}
