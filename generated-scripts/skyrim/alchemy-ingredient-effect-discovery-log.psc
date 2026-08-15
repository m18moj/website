; ScripForge — Alchemy Ingredient Effect Discovery Log
; Pack: Skyrim Pack | Category: Crafting
; Version: 1.0.0
;
; Changelog:
;   1.0.0 - Initial release
;
; A persistent journal that tracks discovered ingredient effects as the player experiments through use.
;
; Creation Kit Papyrus script — compile with the Skyrim Creation Kit.

ScriptName AlchemyIngredientEffectDiscoveryLog extends Quest

; --- Properties -------------------------------------------------------

Actor Property PlayerRef Auto

Ingredient[] Property TrackedIngredients Auto

Int[] Property EffectDiscoveryMask Auto
; Index-aligned with TrackedIngredients — bit 0-3 mark each of the four effects as known

GlobalVariable Property TotalEffectsDiscovered Auto
GlobalVariable Property TotalIngredientsFullyKnown Auto

Message Property IngredientLearnedMessage Auto
; Popup shown the first time an ingredient's effect is identified

; --- Lifecycle ----------------------------------------------------------

Event OnInit()
    RegisterForRemoteEvent(PlayerRef, "OnItemEquipped")
EndEvent

; Eating a raw ingredient in Skyrim fires OnItemEquipped for that ingredient;
; this is our hook into "the player just tasted this ingredient."
Event OnItemEquipped(ObjectReference akSource, Form akBaseObject)
    Ingredient eaten = akBaseObject as Ingredient
    If eaten == None
        Return
    EndIf

    Int idx = FindIngredientIndex(eaten)
    If idx >= 0
        LogFirstKnownEffect(idx, eaten)
    EndIf
EndEvent

; --- Discovery Logging ----------------------------------------------------

; Records whichever effect index the base game has already flagged as known
; (via the ingredient's own known-effect tracking) into our persistent log.
Function LogFirstKnownEffect(Int ingredientIndex, Ingredient akIngredient)
    Int effectIndex = 0
    While effectIndex < 4
        If IsEffectFlaggedKnown(ingredientIndex, effectIndex) == false
            RecordDiscovery(ingredientIndex, effectIndex)
            Return
        EndIf
        effectIndex += 1
    EndWhile
EndFunction

Function RecordDiscovery(Int ingredientIndex, Int effectIndex)
    Int mask = EffectDiscoveryMask[ingredientIndex]
    Int bit = Math.LeftShift(1, effectIndex)

    If Math.LogicalAnd(mask, bit) != 0
        Return ; already logged
    EndIf

    EffectDiscoveryMask[ingredientIndex] = Math.LogicalOr(mask, bit)

    If TotalEffectsDiscovered != None
        TotalEffectsDiscovered.SetValue(TotalEffectsDiscovered.GetValue() + 1.0)
    EndIf

    If IsIngredientFullyKnown(ingredientIndex)
        If TotalIngredientsFullyKnown != None
            TotalIngredientsFullyKnown.SetValue(TotalIngredientsFullyKnown.GetValue() + 1.0)
        EndIf
    EndIf

    If IngredientLearnedMessage != None
        IngredientLearnedMessage.Show()
    EndIf
EndFunction

; --- Queries -----------------------------------------------------------

Bool Function IsEffectFlaggedKnown(Int ingredientIndex, Int effectIndex)
    Int bit = Math.LeftShift(1, effectIndex)
    Return Math.LogicalAnd(EffectDiscoveryMask[ingredientIndex], bit) != 0
EndFunction

Bool Function IsIngredientFullyKnown(Int ingredientIndex)
    Return EffectDiscoveryMask[ingredientIndex] == 15
EndFunction

Int Function FindIngredientIndex(Ingredient akIngredient)
    Int i = 0
    While i < TrackedIngredients.Length
        If TrackedIngredients[i] == akIngredient
            Return i
        EndIf
        i += 1
    EndWhile
    Return -1
EndFunction

Int Function GetDiscoveredEffectCount(Ingredient akIngredient)
    Int idx = FindIngredientIndex(akIngredient)
    If idx < 0
        Return 0
    EndIf

    Int mask = EffectDiscoveryMask[idx]
    Int count = 0
    Int bitIndex = 0
    While bitIndex < 4
        If Math.LogicalAnd(mask, Math.LeftShift(1, bitIndex)) != 0
            count += 1
        EndIf
        bitIndex += 1
    EndWhile
    Return count
EndFunction
