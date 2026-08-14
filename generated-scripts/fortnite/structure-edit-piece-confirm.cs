/*
 * ScriptForge — Structure Edit & Piece Confirm
 * Pack: Fortnite Pack | Category: Building
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Lets a player select an edit pattern on a placed piece, preview it, and confirm or cancel before it applies.
 *
 * Standalone Unity template for building a similar system in your own game —
 * not a modification of any existing commercial title.
 */

using System.Collections.Generic;
using UnityEngine;

namespace ScriptForge.Fortnite.Building
{
    /// <summary>
    /// Attach to a placed structure piece. Allows the player to enter "edit mode",
    /// cycle through edit patterns (e.g. window, door, half-wall), preview the result,
    /// and confirm or cancel. Includes a safeguard that cancels the edit automatically
    /// if the underlying piece is swapped/destroyed while editing is in progress.
    /// </summary>
    [DisallowMultipleComponent]
    public class StructureEditPieceConfirm : MonoBehaviour
    {
        [System.Serializable]
        public struct EditPattern
        {
            public string patternName;
            public GameObject previewPrefab;
        }

        [Header("Edit Configuration")]
        [SerializeField] private List<EditPattern> availablePatterns = new List<EditPattern>();
        [SerializeField] private float editRange = 6f;
        [SerializeField] private KeyCode confirmKey = KeyCode.Mouse0;
        [SerializeField] private KeyCode cancelKey = KeyCode.Mouse1;
        [SerializeField] private KeyCode cyclePatternKey = KeyCode.R;

        [Header("Runtime State (read-only)")]
        [SerializeField] private bool isEditing;
        [SerializeField] private int currentPatternIndex;

        private GameObject activePreviewInstance;
        private int pieceInstanceIdAtEditStart;

        public bool IsEditing => isEditing;

        public delegate void EditConfirmedHandler(GameObject piece, string patternName);
        public event EditConfirmedHandler OnEditConfirmed;

        private void Update()
        {
            if (!isEditing)
                return;

            // Safeguard: if this piece was swapped/replaced by another system (e.g. an
            // upgrade or destruction routine) mid-edit, the GetInstanceID will no longer
            // match what we captured when editing began. Bail out cleanly rather than
            // applying an edit to a stale or destroyed object.
            if (gameObject == null || gameObject.GetInstanceID() != pieceInstanceIdAtEditStart)
            {
                CancelEdit();
                return;
            }

            if (Input.GetKeyDown(cyclePatternKey))
            {
                CyclePattern();
            }

            if (Input.GetKeyDown(confirmKey))
            {
                ConfirmEdit();
            }
            else if (Input.GetKeyDown(cancelKey))
            {
                CancelEdit();
            }
        }

        /// <summary>Begins an edit session on this piece if within range and patterns exist.</summary>
        public bool BeginEdit(Transform playerTransform)
        {
            if (isEditing || availablePatterns.Count == 0)
                return false;

            float distance = Vector3.Distance(playerTransform.position, transform.position);
            if (distance > editRange)
                return false;

            isEditing = true;
            pieceInstanceIdAtEditStart = gameObject.GetInstanceID();
            currentPatternIndex = 0;
            SpawnPreview();
            return true;
        }

        private void CyclePattern()
        {
            currentPatternIndex = (currentPatternIndex + 1) % availablePatterns.Count;
            SpawnPreview();
        }

        private void SpawnPreview()
        {
            ClearPreview();

            EditPattern pattern = availablePatterns[currentPatternIndex];
            if (pattern.previewPrefab != null)
            {
                activePreviewInstance = Instantiate(pattern.previewPrefab, transform.position, transform.rotation, transform);
                SetPreviewVisual(activePreviewInstance, true);
            }
        }

        private void SetPreviewVisual(GameObject preview, bool translucent)
        {
            // Simple visual cue: tint renderers to indicate this is a ghost/preview, not final geometry.
            foreach (var renderer in preview.GetComponentsInChildren<Renderer>())
            {
                if (renderer.material.HasProperty("_Color"))
                {
                    Color c = renderer.material.color;
                    c.a = translucent ? 0.5f : 1f;
                    renderer.material.color = c;
                }
            }
        }

        /// <summary>Applies the currently previewed pattern and ends the edit session.</summary>
        public void ConfirmEdit()
        {
            if (!isEditing)
                return;

            EditPattern pattern = availablePatterns[currentPatternIndex];
            OnEditConfirmed?.Invoke(gameObject, pattern.patternName);

            ClearPreview();
            isEditing = false;
        }

        /// <summary>Aborts the edit session and restores the piece to its prior appearance.</summary>
        public void CancelEdit()
        {
            ClearPreview();
            isEditing = false;
        }

        private void ClearPreview()
        {
            if (activePreviewInstance != null)
            {
                Destroy(activePreviewInstance);
                activePreviewInstance = null;
            }
        }

        private void OnDisable()
        {
            // Ensure preview objects never leak if this component is disabled mid-edit.
            if (isEditing)
                CancelEdit();
        }
    }
}
