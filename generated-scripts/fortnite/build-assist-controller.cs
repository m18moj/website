/*
 * ScriptForge — Build Edit & Piece Snap System
 * Pack: Fortnite Pack | Category: Building
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Handles ghost-piece placement, grid snapping, 90-degree rotation and edit-mode confirmation for wall/floor/ramp structures.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System.Collections.Generic;
using UnrealEngine;

namespace ScriptForge.Fortnite.Building
{
    public enum PieceType { Wall, Floor, Ramp, Cone }

    [RequireComponent(typeof(Camera))]
    public class BuildAssistController : MonoBehaviour
    {
        [Header("References")]
        [SerializeField] private Camera _playerCamera;
        [SerializeField] private LayerMask _placementMask;
        [SerializeField] private GameObject[] _ghostPrefabs; // indexed by PieceType

        [Header("Grid Settings")]
        [SerializeField] private float _gridSize = 4f;
        [SerializeField] private float _maxPlaceDistance = 20f;

        [Header("Edit Mode")]
        [SerializeField] private KeyCode _editKey = KeyCode.G;
        [SerializeField] private KeyCode _rotateKey = KeyCode.R;
        [SerializeField] private KeyCode _confirmKey = KeyCode.Mouse0;

        private PieceType _currentPiece = PieceType.Wall;
        private GameObject _ghostInstance;
        private Quaternion _ghostRotation = Quaternion.identity;
        private bool _isEditingPiece;
        private GameObject _editTarget;
        private readonly Dictionary<GameObject, PieceType> _placedPieces = new Dictionary<GameObject, PieceType>();

        private void Update()
        {
            HandlePieceSelection();
            UpdateGhostPreview();

            if (Input.GetKeyDown(_rotateKey))
            {
                RotateGhost90();
            }

            if (Input.GetKeyDown(_confirmKey))
            {
                if (_isEditingPiece)
                {
                    ConfirmEdit();
                }
                else
                {
                    PlacePiece();
                }
            }

            if (Input.GetKeyDown(_editKey))
            {
                ToggleEditMode();
            }
        }

        private void HandlePieceSelection()
        {
            if (Input.GetKeyDown(KeyCode.Alpha1)) _currentPiece = PieceType.Wall;
            if (Input.GetKeyDown(KeyCode.Alpha2)) _currentPiece = PieceType.Floor;
            if (Input.GetKeyDown(KeyCode.Alpha3)) _currentPiece = PieceType.Ramp;
            if (Input.GetKeyDown(KeyCode.Alpha4)) _currentPiece = PieceType.Cone;
        }

        // Raycasts from the camera, snaps the hit point to the build grid and previews the ghost piece.
        private void UpdateGhostPreview()
        {
            if (_isEditingPiece) return;

            Ray ray = _playerCamera.ViewportPointToRay(new Vector3(0.5f, 0.5f, 0f));
            if (!Physics.Raycast(ray, out RaycastHit hit, _maxPlaceDistance, _placementMask))
            {
                SetGhostVisible(false);
                return;
            }

            Vector3 snapped = SnapToGrid(hit.point);
            EnsureGhostInstance();
            _ghostInstance.transform.SetPositionAndRotation(snapped, _ghostRotation);
            SetGhostVisible(true);
        }

        private Vector3 SnapToGrid(Vector3 worldPoint)
        {
            float x = Mathf.Round(worldPoint.x / _gridSize) * _gridSize;
            float y = Mathf.Round(worldPoint.y / _gridSize) * _gridSize;
            float z = Mathf.Round(worldPoint.z / _gridSize) * _gridSize;
            return new Vector3(x, y, z);
        }

        private void RotateGhost90()
        {
            _ghostRotation *= Quaternion.Euler(0f, 90f, 0f);
        }

        private void PlacePiece()
        {
            if (_ghostInstance == null || !_ghostInstance.activeSelf) return;

            GameObject prefab = _ghostPrefabs[(int)_currentPiece];
            GameObject placed = Instantiate(prefab, _ghostInstance.transform.position, _ghostInstance.transform.rotation);
            _placedPieces[placed] = _currentPiece;
        }

        private void ToggleEditMode()
        {
            _isEditingPiece = !_isEditingPiece;

            if (_isEditingPiece)
            {
                Ray ray = _playerCamera.ViewportPointToRay(new Vector3(0.5f, 0.5f, 0f));
                if (Physics.Raycast(ray, out RaycastHit hit, _maxPlaceDistance, _placementMask) &&
                    _placedPieces.ContainsKey(hit.collider.gameObject))
                {
                    _editTarget = hit.collider.gameObject;
                }
                else
                {
                    _isEditingPiece = false;
                }
            }
            else
            {
                _editTarget = null;
            }
        }

        // Applies the pending edit (e.g. a doorway/window cutout swap) and exits edit mode.
        private void ConfirmEdit()
        {
            if (_editTarget == null) return;
            // Placeholder for a real cutout/piece-swap pipeline: swap mesh, recompute colliders, etc.
            _editTarget = null;
            _isEditingPiece = false;
        }

        private void EnsureGhostInstance()
        {
            GameObject prefab = _ghostPrefabs[(int)_currentPiece];
            if (_ghostInstance == null)
            {
                _ghostInstance = Instantiate(prefab);
            }
        }

        private void SetGhostVisible(bool visible)
        {
            if (_ghostInstance != null)
            {
                _ghostInstance.SetActive(visible);
            }
        }
    }
}
