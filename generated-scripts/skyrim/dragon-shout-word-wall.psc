; ScriptForge — Dragon Shout & Word Wall
; Pack: Skyrim Pack | Category: Systems
; Version: 1.0.0
;
; Changelog:
;   1.0.0 - Initial release
;
; Word wall discovery, shout word unlocking, and shout cooldown/charge management.
;
; Creation Kit Papyrus script — compile with the Skyrim Creation Kit.

ScriptName DragonShoutWordWall extends ObjectReference

; --- Properties -------------------------------------------------------

Actor Property PlayerRef Auto

Shout Property LinkedShout Auto
; The shout this word wall grants a word for

Int Property WordIndex = 0 Auto
; 0, 1, or 2 — which of the shout's three words this wall teaches

GlobalVariable Property WordWallsDiscovered Auto
; Running total of word walls discovered, for achievement/dialogue conditioning

Bool Property IsDiscovered = false Auto

Sound Property WordWallDiscoverySound Auto
VisualEffect Property WordWallGlowEffect Auto

; --- Lifecycle ----------------------------------------------------------

Event OnInit()
    RegisterForRemoteEvent(PlayerRef, "OnPlayerLoadGame")
EndEvent

; --- Discovery -----------------------------------------------------------

; Called from OnActivate once proximity/puzzle conditions for the wall are satisfied
Event OnActivate(ObjectReference akActionRef)
    If akActionRef != PlayerRef
        Return
    EndIf

    If IsDiscovered
        Debug.Notification("You have already unlocked this word.")
        Return
    EndIf

    UnlockWord()
EndEvent

Function UnlockWord()
    If LinkedShout == None
        Return
    EndIf

    IsDiscovered = true

    If WordWallGlowEffect != None
        WordWallGlowEffect.Play(Self)
    EndIf
    If WordWallDiscoverySound != None
        WordWallDiscoverySound.Play(Self)
    EndIf

    PlayerRef.UnlockWord(LinkedShout.GetWord(WordIndex))

    If WordWallsDiscovered != None
        WordWallsDiscovered.SetValue(WordWallsDiscovered.GetValue() + 1.0)
    EndIf

    Debug.Notification("Word of Power learned: " + LinkedShout.GetName())
EndFunction

; --- Charge / Cooldown Management -------------------------------------------

; Shout recovery is largely handled natively by the engine; this exposes a
; helper for quest scripts that want to grant an instant recharge (e.g. a
; Daedric reward that removes shout cooldown for a limited time).
Function GrantInstantRecharge()
    If LinkedShout != None
        PlayerRef.UnlockWord(LinkedShout.GetWord(0))
        PlayerRef.UnlockWord(LinkedShout.GetWord(1))
        PlayerRef.UnlockWord(LinkedShout.GetWord(2))
    EndIf
EndFunction

Bool Function IsShoutFullyUnlocked()
    If LinkedShout == None
        Return false
    EndIf
    Return PlayerRef.HasShout(LinkedShout) && LinkedShout.GetKnownWordCount() >= 3
EndFunction

Event OnPlayerLoadGame()
    ; Re-sync the visual "already discovered" state on load, since walls
    ; that were unlocked should stop displaying their activation prompt glow.
    If IsDiscovered && WordWallGlowEffect != None
        WordWallGlowEffect.Stop(Self)
    EndIf
EndEvent
