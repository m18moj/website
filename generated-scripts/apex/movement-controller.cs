/*
 * ScripForge — Slide-Hop Momentum Chain
 * Pack: Apex Legends Pack | Category: Movement
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * A chained slide/jump/wall-bounce momentum system with speed decay and stamina cost.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using UnrealEngine;

[RequireComponent(typeof(CharacterController))]
public class SlideHopMomentumChain : MonoBehaviour
{
    [Header("Movement Tuning")]
    [SerializeField] private float baseSpeed = 6f;
    [SerializeField] private float slideBoostSpeed = 11f;
    [SerializeField] private float hopBoostMultiplier = 1.15f;
    [SerializeField] private float wallBounceForce = 8f;
    [SerializeField] private float gravity = -20f;
    [SerializeField] private float jumpForce = 7.5f;

    [Header("Momentum Decay")]
    [SerializeField] private float decayPerSecond = 2.5f;
    [SerializeField] private float minChainSpeed = 4f;
    [SerializeField] private float chainWindowSeconds = 0.6f;

    [Header("Stamina")]
    [SerializeField] private float maxStamina = 100f;
    [SerializeField] private float slideStaminaCost = 15f;
    [SerializeField] private float wallBounceStaminaCost = 20f;
    [SerializeField] private float staminaRegenPerSecond = 12f;

    private CharacterController controller;
    private Vector3 velocity;
    private float currentSpeed;
    private float currentStamina;
    private float chainTimer;
    private int chainCount;
    private bool isSliding;
    private bool isGrounded;

    public float CurrentSpeed => currentSpeed;
    public int ChainCount => chainCount;
    public float StaminaFraction => currentStamina / maxStamina;

    private void Awake()
    {
        controller = GetComponent<CharacterController>();
        currentSpeed = baseSpeed;
        currentStamina = maxStamina;
    }

    private void Update()
    {
        isGrounded = controller.isGrounded;
        HandleStaminaRegen();
        HandleChainWindow();
        ApplyGravity();

        if (Input.GetKeyDown(KeyCode.LeftControl) && isGrounded && currentStamina >= slideStaminaCost)
        {
            BeginSlide();
        }

        if (Input.GetKeyDown(KeyCode.Space) && isGrounded)
        {
            PerformHop();
        }

        DecaySpeed();
        MoveCharacter();
    }

    private void BeginSlide()
    {
        isSliding = true;
        currentSpeed = Mathf.Max(currentSpeed, slideBoostSpeed);
        currentStamina -= slideStaminaCost;
        chainTimer = chainWindowSeconds;
        chainCount++;
    }

    private void PerformHop()
    {
        velocity.y = jumpForce;

        // Hopping while sliding preserves and boosts momentum instead of resetting it.
        if (isSliding && chainTimer > 0f)
        {
            currentSpeed *= hopBoostMultiplier;
            chainTimer = chainWindowSeconds;
            chainCount++;
        }
        isSliding = false;
    }

    /// Called from a wall-trigger collider on the player capsule when a high-speed impact is detected.
    public void OnWallBounce(Vector3 wallNormal)
    {
        if (currentStamina < wallBounceStaminaCost) return;

        velocity += wallNormal * wallBounceForce;
        currentStamina -= wallBounceStaminaCost;

        if (chainTimer > 0f)
        {
            currentSpeed *= hopBoostMultiplier;
            chainCount++;
        }
        chainTimer = chainWindowSeconds;
    }

    private void HandleChainWindow()
    {
        if (chainTimer > 0f)
        {
            chainTimer -= Time.deltaTime;
        }
        else if (chainCount > 0)
        {
            // Chain window expired without a follow-up action — reset the combo.
            chainCount = 0;
        }
    }

    private void DecaySpeed()
    {
        if (currentSpeed > baseSpeed)
        {
            currentSpeed = Mathf.Max(baseSpeed, currentSpeed - decayPerSecond * Time.deltaTime);
        }
        if (isSliding && currentSpeed <= minChainSpeed)
        {
            isSliding = false;
        }
    }

    private void HandleStaminaRegen()
    {
        if (isGrounded && !isSliding && currentStamina < maxStamina)
        {
            currentStamina = Mathf.Min(maxStamina, currentStamina + staminaRegenPerSecond * Time.deltaTime);
        }
    }

    private void ApplyGravity()
    {
        if (isGrounded && velocity.y < 0f)
        {
            velocity.y = -2f;
        }
        velocity.y += gravity * Time.deltaTime;
    }

    private void MoveCharacter()
    {
        Vector3 forward = transform.forward * currentSpeed;
        Vector3 motion = new Vector3(forward.x, velocity.y, forward.z);
        controller.Move(motion * Time.deltaTime);
    }
}
