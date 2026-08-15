; ScripForge — ForgeClient (Skyrim)
; Component: MCM Configuration Menu
; Version: 1.0.0
;
; Central Mod Configuration Menu exposing tunable settings for the ScripForge Skyrim script pack.
;
; SkyUI Mod Configuration Menu (MCM) script — compile with the Creation Kit
; or a Papyrus compiler, and requires SKSE + SkyUI installed.

ScriptName ForgeClientMCM extends SKI_ConfigBase

; Properties below mirror the equivalent tunables on the pack's individual
; gameplay scripts (see generated-scripts/skyrim/*.psc). To make a change here
; take effect in-game: fill the matching Property on the target script with
; the same value in the Creation Kit, or convert the shared value to a
; GlobalVariable and point both scripts' Properties at it for automatic sync.

; --- Followers & Player Home ---
Int Property MaxActiveFollowers = 1 Auto ; mirrors FollowerRecruitmentManagement.MaxActiveFollowers
Bool Property EnableWellRestedBonus = true Auto ; gates MarriagePlayerHome's sleep bonus grant
Bool Property EnableInstantShoutRecharge = false Auto ; gates DragonShoutWordWall.GrantInstantRecharge()

; --- Crime & Reputation ---
Int Property AssaultBounty = 40 Auto ; mirrors CrimeBountyTracking.AssaultBounty
Int Property MurderBounty = 1000 Auto ; mirrors CrimeBountyTracking.MurderBounty
Bool Property EnableReputationHostility = true Auto ; gates FactionReputationLogic hostility threshold

; --- Progression ---
Float Property LegendarySkillThreshold = 100.0 Auto ; mirrors PerkRespecLegendarySkill.LegendarySkillThreshold
Bool Property EnableFreeRespec = false Auto ; when true, PerformFullRespec waives its gold/token cost
Int Property PointsPerLevel = 1 Auto ; mirrors SkillTreeSystem.PointsPerLevel

; --- World & Economy ---
Float Property RestockIntervalHours = 48.0 Auto ; mirrors MerchantRestockInventory.RestockIntervalHours
Int Property SpecialtyItemCount = 3 Auto ; mirrors MerchantRestockInventory.SpecialtyItemCount
Int Property WeatherEffectIntensity = 2 Auto ; 0=Off 1=Low 2=Medium 3=High, scales WeatherSeasonalEffects
Int Property WorldEventFrequency = 1 Auto ; 0=Off 1=Normal 2=High, drives WorldEventManager's interval range

; Menu content arrays, built once in OnConfigInit and reused by OnPageReset
; and the menu open/accept handlers so displayed text always matches index.
String[] Property WeatherIntensityLabels Auto Hidden
String[] Property WorldEventFrequencyLabels Auto Hidden

; --- Initialization ---------------------------------------------------------

Event OnConfigInit()
    ModName = "ScripForge Client"
    Pages = new String[4]
    Pages[0] = "Followers & Home"
    Pages[1] = "Crime & Reputation"
    Pages[2] = "Progression"
    Pages[3] = "World & Economy"

    WeatherIntensityLabels = new String[4]
    WeatherIntensityLabels[0] = "Off"
    WeatherIntensityLabels[1] = "Low"
    WeatherIntensityLabels[2] = "Medium"
    WeatherIntensityLabels[3] = "High"

    WorldEventFrequencyLabels = new String[3]
    WorldEventFrequencyLabels[0] = "Off"
    WorldEventFrequencyLabels[1] = "Normal"
    WorldEventFrequencyLabels[2] = "High"
EndEvent

; --- Page Building -----------------------------------------------------------

Event OnPageReset(String a_page)
    If a_page == "Followers & Home"
        AddHeaderOption("Follower Roster")
        AddSliderOptionST("MaxActiveFollowers", "Max Active Followers", MaxActiveFollowers as Float, "{0}")
        AddHeaderOption("Player Home & Marriage")
        AddToggleOptionST("EnableWellRestedBonus", "Well Rested Bonus When Married", EnableWellRestedBonus)
        AddHeaderOption("Word Walls")
        AddToggleOptionST("EnableInstantShoutRecharge", "Allow Instant Shout Recharge", EnableInstantShoutRecharge)
    ElseIf a_page == "Crime & Reputation"
        AddHeaderOption("Bounty Values")
        AddSliderOptionST("AssaultBounty", "Assault Bounty", AssaultBounty as Float, "{0} gold")
        AddSliderOptionST("MurderBounty", "Murder Bounty", MurderBounty as Float, "{0} gold")
        AddHeaderOption("Faction Standing")
        AddToggleOptionST("EnableReputationHostility", "Enable Reputation-Based Hostility", EnableReputationHostility)
    ElseIf a_page == "Progression"
        AddHeaderOption("Legendary Skills")
        AddSliderOptionST("LegendarySkillThreshold", "Legendary Skill Threshold", LegendarySkillThreshold, "{1}")
        AddHeaderOption("Perk Respec")
        AddToggleOptionST("EnableFreeRespec", "Free Perk Respec", EnableFreeRespec)
        AddHeaderOption("Skill Tree")
        AddSliderOptionST("PointsPerLevel", "Skill Points Per Level", PointsPerLevel as Float, "{0}")
    ElseIf a_page == "World & Economy"
        AddHeaderOption("Merchants")
        AddSliderOptionST("RestockIntervalHours", "Restock Interval", RestockIntervalHours, "{1} hrs")
        AddSliderOptionST("SpecialtyItemCount", "Specialty Items Per Restock", SpecialtyItemCount as Float, "{0}")
        AddHeaderOption("Weather")
        AddMenuOptionST("WeatherEffectIntensity", "Weather Effect Intensity", WeatherIntensityLabels[WeatherEffectIntensity])
        AddHeaderOption("Radiant World Events")
        AddMenuOptionST("WorldEventFrequency", "World Event Frequency", WorldEventFrequencyLabels[WorldEventFrequency])
    EndIf
EndEvent

; --- Toggle Handling -----------------------------------------------------------

Event OnOptionSelect(Int a_option)
    String state = GetState(a_option)
    If state == "EnableWellRestedBonus"
        EnableWellRestedBonus = !EnableWellRestedBonus
        SetToggleOptionValueST(state, EnableWellRestedBonus)
    ElseIf state == "EnableInstantShoutRecharge"
        EnableInstantShoutRecharge = !EnableInstantShoutRecharge
        SetToggleOptionValueST(state, EnableInstantShoutRecharge)
    ElseIf state == "EnableReputationHostility"
        EnableReputationHostility = !EnableReputationHostility
        SetToggleOptionValueST(state, EnableReputationHostility)
    ElseIf state == "EnableFreeRespec"
        EnableFreeRespec = !EnableFreeRespec
        SetToggleOptionValueST(state, EnableFreeRespec)
    EndIf
EndEvent

; --- Slider Handling -----------------------------------------------------------

Event OnOptionSliderOpen(Int a_option)
    String state = GetState(a_option)
    If state == "MaxActiveFollowers"
        SetSliderDialogRange(1.0, 8.0)
        SetSliderDialogInterval(1.0)
        SetSliderDialogStartValue(MaxActiveFollowers as Float)
    ElseIf state == "AssaultBounty"
        SetSliderDialogRange(0.0, 200.0)
        SetSliderDialogInterval(5.0)
        SetSliderDialogStartValue(AssaultBounty as Float)
    ElseIf state == "MurderBounty"
        SetSliderDialogRange(200.0, 5000.0)
        SetSliderDialogInterval(100.0)
        SetSliderDialogStartValue(MurderBounty as Float)
    ElseIf state == "LegendarySkillThreshold"
        SetSliderDialogRange(50.0, 100.0)
        SetSliderDialogInterval(5.0)
        SetSliderDialogStartValue(LegendarySkillThreshold)
    ElseIf state == "PointsPerLevel"
        SetSliderDialogRange(1.0, 5.0)
        SetSliderDialogInterval(1.0)
        SetSliderDialogStartValue(PointsPerLevel as Float)
    ElseIf state == "RestockIntervalHours"
        SetSliderDialogRange(6.0, 168.0)
        SetSliderDialogInterval(6.0)
        SetSliderDialogStartValue(RestockIntervalHours)
    ElseIf state == "SpecialtyItemCount"
        SetSliderDialogRange(0.0, 10.0)
        SetSliderDialogInterval(1.0)
        SetSliderDialogStartValue(SpecialtyItemCount as Float)
    EndIf
EndEvent

Event OnOptionSliderAccept(Int a_option, Float a_value)
    String state = GetState(a_option)
    If state == "MaxActiveFollowers"
        MaxActiveFollowers = a_value as Int
        SetSliderOptionValueST(state, a_value, "{0}")
    ElseIf state == "AssaultBounty"
        AssaultBounty = a_value as Int
        SetSliderOptionValueST(state, a_value, "{0} gold")
    ElseIf state == "MurderBounty"
        MurderBounty = a_value as Int
        SetSliderOptionValueST(state, a_value, "{0} gold")
    ElseIf state == "LegendarySkillThreshold"
        LegendarySkillThreshold = a_value
        SetSliderOptionValueST(state, a_value, "{1}")
    ElseIf state == "PointsPerLevel"
        PointsPerLevel = a_value as Int
        SetSliderOptionValueST(state, a_value, "{0}")
    ElseIf state == "RestockIntervalHours"
        RestockIntervalHours = a_value
        SetSliderOptionValueST(state, a_value, "{1} hrs")
    ElseIf state == "SpecialtyItemCount"
        SpecialtyItemCount = a_value as Int
        SetSliderOptionValueST(state, a_value, "{0}")
    EndIf
EndEvent

; --- Menu Handling -----------------------------------------------------------

Event OnOptionMenuOpen(Int a_option)
    String state = GetState(a_option)
    If state == "WeatherEffectIntensity"
        SetMenuDialogOptions(WeatherIntensityLabels)
        SetMenuDialogDefaultIndex(WeatherEffectIntensity)
    ElseIf state == "WorldEventFrequency"
        SetMenuDialogOptions(WorldEventFrequencyLabels)
        SetMenuDialogDefaultIndex(WorldEventFrequency)
    EndIf
EndEvent

Event OnOptionMenuAccept(Int a_option, Int a_index)
    String state = GetState(a_option)
    If state == "WeatherEffectIntensity"
        WeatherEffectIntensity = a_index
        SetMenuOptionValueST(state, WeatherIntensityLabels[a_index])
    ElseIf state == "WorldEventFrequency"
        WorldEventFrequency = a_index
        SetMenuOptionValueST(state, WorldEventFrequencyLabels[a_index])
    EndIf
EndEvent
