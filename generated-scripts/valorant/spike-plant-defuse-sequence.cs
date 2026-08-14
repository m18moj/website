/*
 * ScriptForge — Spike Plant & Defuse Sequence
 * Pack: Valorant Pack | Category: Systems
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Timed plant/defuse interaction with a visible progress bar that interrupts when the actor takes damage.
 *
 * Standalone Unity template for building a similar system in your own game —
 * not a modification of any existing commercial title.
 */

using UnityEngine;
using UnityEngine.UI;

namespace ScriptForge.Valorant.Systems
{
    public enum BombSiteState
    {
        Idle,
        Planting,
        Planted,
        Defusing,
        Defused,
        Detonated
    }

    /// <summary>
    /// Drives a plant/defuse interaction (e.g. a round-objective "bomb").
    /// Both actions require the player to hold an interact button for a fixed
    /// duration; taking damage during the action cancels progress immediately,
    /// matching the tension of round-based tactical shooters.
    /// </summary>
    public class SpikePlantDefuseSequence : MonoBehaviour
    {
        [Header("Timing")]
        [SerializeField] private float plantDurationSeconds = 4f;
        [SerializeField] private float defuseDurationSeconds = 7f;
        [Tooltip("Detonation countdown once the spike is successfully planted.")]
        [SerializeField] private float fuseDurationSeconds = 45f;

        [Header("UI")]
        [SerializeField] private Slider progressBar;
        [SerializeField] private GameObject progressBarRoot;

        public BombSiteState State { get; private set; } = BombSiteState.Idle;

        /// <summary>Fired when planting completes and the fuse begins.</summary>
        public event System.Action OnPlanted;
        /// <summary>Fired when defusing completes and the fuse is disarmed.</summary>
        public event System.Action OnDefused;
        /// <summary>Fired when the fuse runs out with nobody defusing it.</summary>
        public event System.Action OnDetonated;
        /// <summary>Fired whenever an in-progress plant/defuse is interrupted.</summary>
        public event System.Action OnInterrupted;

        private float _actionProgress;
        private float _fuseRemaining;
        private GameObject _currentActor;

        private void Update()
        {
            switch (State)
            {
                case BombSiteState.Planting:
                case BombSiteState.Defusing:
                    UpdateActionProgress();
                    break;

                case BombSiteState.Planted:
                    UpdateFuse();
                    break;
            }
        }

        /// <summary>Call every frame from the actor's input handler while the interact key is held.</summary>
        public void HoldInteract(GameObject actor)
        {
            if (State == BombSiteState.Idle)
            {
                BeginAction(actor, BombSiteState.Planting);
            }
            else if (State == BombSiteState.Planted)
            {
                BeginAction(actor, BombSiteState.Defusing);
            }
            else if ((State == BombSiteState.Planting || State == BombSiteState.Defusing) && actor == _currentActor)
            {
                // Continue accumulating progress; handled in Update().
            }
        }

        /// <summary>Call when the actor releases the interact key or moves away — cancels the action.</summary>
        public void ReleaseInteract(GameObject actor)
        {
            if (actor != _currentActor)
                return;

            if (State == BombSiteState.Planting || State == BombSiteState.Defusing)
            {
                InterruptAction(revertToState: State == BombSiteState.Planting ? BombSiteState.Idle : BombSiteState.Planted);
            }
        }

        /// <summary>Call from the actor's health/damage system to cancel any in-progress action.</summary>
        public void NotifyActorDamaged(GameObject actor)
        {
            if (actor == _currentActor && (State == BombSiteState.Planting || State == BombSiteState.Defusing))
            {
                InterruptAction(revertToState: State == BombSiteState.Planting ? BombSiteState.Idle : BombSiteState.Planted);
            }
        }

        private void BeginAction(GameObject actor, BombSiteState actionState)
        {
            _currentActor = actor;
            _actionProgress = 0f;
            State = actionState;
            SetProgressBarVisible(true);
        }

        private void UpdateActionProgress()
        {
            float duration = State == BombSiteState.Planting ? plantDurationSeconds : defuseDurationSeconds;
            _actionProgress += Time.deltaTime;
            SetProgressBarValue(_actionProgress / duration);

            if (_actionProgress >= duration)
            {
                CompleteAction();
            }
        }

        private void CompleteAction()
        {
            SetProgressBarVisible(false);

            if (State == BombSiteState.Planting)
            {
                State = BombSiteState.Planted;
                _fuseRemaining = fuseDurationSeconds;
                OnPlanted?.Invoke();
            }
            else if (State == BombSiteState.Defusing)
            {
                State = BombSiteState.Defused;
                OnDefused?.Invoke();
            }

            _currentActor = null;
        }

        private void UpdateFuse()
        {
            _fuseRemaining -= Time.deltaTime;
            if (_fuseRemaining <= 0f)
            {
                State = BombSiteState.Detonated;
                OnDetonated?.Invoke();
            }
        }

        private void InterruptAction(BombSiteState revertToState)
        {
            State = revertToState;
            _currentActor = null;
            _actionProgress = 0f;
            SetProgressBarVisible(false);
            OnInterrupted?.Invoke();
        }

        private void SetProgressBarVisible(bool visible)
        {
            if (progressBarRoot != null)
                progressBarRoot.SetActive(visible);
        }

        private void SetProgressBarValue(float normalized)
        {
            if (progressBar != null)
                progressBar.value = Mathf.Clamp01(normalized);
        }
    }
}
