# Thornwrithe Rulebook

This is the persistent rules reference for Thornwrithe's D20 and MUD-inspired
game engine. It is written for both players and implementers: player-facing
rules describe what should be visible in play, while implementation notes define
the data contracts and resolver behavior the engine should enforce.

Status: canonical rules for Thornwrithe weapon, combat, and progression. As of
Thornwrithe `1.8.6`, the runtime implements JSON-backed rule packs,
item-driven weapon dice, `+5` enhancement validation, weapon critical ranges,
monster alignment, Holy damage against Evil, boss-only enhancement gates, the
`consider` MUD skill, XP-based real level progression capped at level 15, and
effect-adjusted current level for level drain. The remaining equipment commands,
item comparison surfaces, broader loot placement, and expanded HUD graphics are
next.

## Design Pillars

- D20 clarity: uncertain actions resolve as `d20 + modifiers` against a defense
  or difficulty class.
- MUD readability: every important result should be explainable through compact
  text logs, commands, and room-style feedback.
- Server authority: combat, checks, loot, character advancement, and durable
  state are resolved on the server.
- Visible fiction: mechanical traits such as holy damage, boss protections, and
  critical hits should have clear log text and HUD cues.
- Small durable state: progression belongs in R1FS checkpoints; shard-local
  encounter state can remain disposable.

## Current Implementation Snapshot

| Rule Area | Thornwrithe 1.8.6 Behavior | Target Rulebook Behavior |
| --- | --- | --- |
| Rule data | XP, class attack tables, class bases, weapon table, combat constants, and alignments load from `content/rules/*.json`. | Inspectable JSON rule packs, TypeScript resolver code. |
| Weapon damage | Equipped weapon type supplies damage dice, with class fallback when unarmed. | Equipped weapon type supplies damage dice. |
| Weapon bonuses | Item `bonus` validates from `+0` to `+5`. | Weapon enhancement is capped at `+5`. |
| Critical hits | Weapon-specific critical ranges and multipliers resolve on the attack roll. | Weapon-specific critical ranges and multipliers. |
| Combat readability | Hit logs show damage, remaining HP, and bloodied cues when a combatant crosses half HP. | MUD-readable combat state in every round. |
| Alignment | Monsters support the D20 nine-alignment grid. | D20-style nine-alignment system. |
| Holy modifier | Holy weapons deal `2x` post-critical damage against Evil targets. | Holy weapons deal `2x` damage against Evil targets. |
| Boss protection | Only boss mobs may require `+1` to `+3` enhancement to hit. | Only boss mobs may require `+1` to `+3` enhancement to hit. |
| `consider` skill | Implemented as a MUD command with threat, alignment, damage, and gate hints. | MUD-style threat appraisal command and skill check. |
| Level progression | XP advances `realLevel` from the canonical table, `currentLevel` applies level effects, and the cap is 15. | Level 15 is the current cap. |

## Rule Data Files

Rules that designers and operators need to inspect live in JSON under
`content/rules`:

| File | Owns |
| --- | --- |
| `progression.json` | `maxLevel`, XP table, and target XP/hour. |
| `classes.json` | Per-level class attack tables, attack ability, target defense, HP, speed, surges, base AC bonus, default unarmed damage, and actions. |
| `weapons.json` | Canonical weapon type table: damage dice, critical range, multiplier, category, and label. |
| `combat.json` | Enhancement caps, boss gate cap, Holy multiplier, critical confirmation mode, and natural 1/20 behavior. |
| `alignments.json` | Alignment labels and whether an alignment counts as Evil. |

TypeScript owns rule resolution: dice rolling, attack comparison, damage order,
checkpoint normalization, and persistence behavior. JSON owns the tunable data.

## Dice And Notation

- `d20` means one twenty-sided die.
- `1d4`, `1d6`, `1d8`, `1d10`, `1d12`, and `2d6` are valid standard weapon
  damage expressions.
- Thornwrithe's normal player weapon band should run from `1d4` to `2d6`.
- Monsters may use larger expressions when the creature itself is the weapon,
  such as a boss claw attack dealing `3d6`.
- `1d8+3` means roll one eight-sided die and add three.
- `19-20/x2` means a natural 19 or 20 is a critical hit if the attack lands,
  and the critical multiplies weapon damage by two.

## Core Combat Loop

1. Roll initiative when an encounter starts.
2. Select or queue an action.
3. Roll the attack: `d20 + attack bonuses`.
4. Check boss enhancement protection before damage is applied.
5. If the natural roll is inside the weapon's critical range and the attack
   lands, mark the hit as critical.
6. Roll damage, apply critical multiplication, apply modifiers such as Holy,
   then apply protection and resistance.
7. Log the result in clear MUD-style text.
8. Persist durable changes when the encounter resolves.

Attack roll:

```text
d20 + base attack + ability modifier + weapon enhancement + temporary modifiers
```

Damage roll:

```text
weapon dice + ability modifier + weapon enhancement + damage modifiers
```

Natural roll rules:

- Natural `1` always misses.
- Natural `20` always hits if the attack is allowed to affect the target.
- Natural `20` is always a critical hit if the target can be affected and the
  attack is not blocked.
- Natural `20` does not bypass boss minimum-enhancement protection.

## Defenses

Thornwrithe keeps the D20 defense language already visible in logs:

- `AC`: armor class, used for most weapon attacks.
- `Fortitude`: toughness, poison, disease, crushing force, and endurance.
- `Reflex`: evasion, traps, blasts, falling hazards, and quick movement.
- `Will`: fear, charm, illusion, curses, and spiritual pressure.

Field checks should use the same format:

```text
Scout check: d20 + Wisdom vs DC 14
```

## Character Level Progression

`realLevel` is derived from total XP. Thornwrithe's current level cap is level
15. Once a character reaches level 15, additional XP may remain on the
character, but no real level above 15 is granted until the cap is deliberately
raised.

`currentLevel` is the effective level after temporary effects. Vampire level
drain, curses, blessings, zone effects, and similar mechanics modify
`currentLevel` without reducing XP or `realLevel`.

XP table:

| Level | Total XP Needed | XP From Previous | Cumulative Hours @ 3,000 XP/hour |
| ---: | ---: | ---: | ---: |
| 1 | 0 | 0 | 0.0 |
| 2 | 1,000 | 1,000 | 0.3 |
| 3 | 2,250 | 1,250 | 0.8 |
| 4 | 3,750 | 1,500 | 1.3 |
| 5 | 5,500 | 1,750 | 1.8 |
| 6 | 7,500 | 2,000 | 2.5 |
| 7 | 10,000 | 2,500 | 3.3 |
| 8 | 13,000 | 3,000 | 4.3 |
| 9 | 16,500 | 3,500 | 5.5 |
| 10 | 20,500 | 4,000 | 6.8 |
| 11 | 26,000 | 5,500 | 8.7 |
| 12 | 32,000 | 6,000 | 10.7 |
| 13 | 39,000 | 7,000 | 13.0 |
| 14 | 47,000 | 8,000 | 15.7 |
| 15 | 57,000 | 10,000 | 19.0 |

Pacing notes:

- `3,000 XP/hour` is the current target planning rate for repeatable adventure
  play, not a guarantee from the first starter quest chain.
- At `2,000 XP/hour`, level 15 takes about 28.5 hours.
- At `3,000 XP/hour`, level 15 takes about 19.0 hours.
- At `4,000 XP/hour`, level 15 takes about 14.3 hours.
- The online automated quest runner is not a player pacing benchmark because it
  moves optimally, ignores reading time, and repeats fresh-character routes.

## Class Attack Progression

The current hero attack formula is:

```text
d20 + class attack progression + attack ability modifier + weapon enhancement
```

Class attack progression is the class's level-based accuracy before ability and
weapon bonuses. The engine reads explicit per-level class tables from
`content/rules/classes.json`; the earlier multipliers were design notes used to
precalculate this table, not runtime formulas.

Combat indexes this table by `currentLevel`, not `realLevel`. A level 10 fighter
under `-2` vampire level drain attacks as level 8 until the effect is removed.

Attack ability:

| Class | Attack Ability | Target Defense |
| --- | --- | --- |
| Fighter | Strength | `AC` |
| Rogue | Dexterity | `Reflex` |
| Wizard | Intelligence | `Will` |
| Cleric | Wisdom | `Will` |

Class attack progression table:

| Level | Fighter | Rogue | Wizard | Cleric |
| ---: | ---: | ---: | ---: | ---: |
| 1 | +1 | +1 | +0 | +1 |
| 2 | +2 | +1 | +1 | +1 |
| 3 | +3 | +2 | +1 | +2 |
| 4 | +4 | +3 | +1 | +2 |
| 5 | +5 | +4 | +2 | +3 |
| 6 | +6 | +4 | +2 | +3 |
| 7 | +7 | +5 | +2 | +4 |
| 8 | +8 | +6 | +2 | +4 |
| 9 | +9 | +6 | +3 | +5 |
| 10 | +10 | +7 | +3 | +5 |
| 11 | +11 | +8 | +3 | +6 |
| 12 | +12 | +8 | +4 | +6 |
| 13 | +13 | +9 | +4 | +7 |
| 14 | +14 | +10 | +4 | +7 |
| 15 | +15 | +11 | +5 | +8 |

Example:

```text
Level 10 Fighter, Strength +3, +2 Longsword:
Attack bonus = +10 class attack progression + 3 Strength + 2 weapon = +15.
```

```text
Level 10 Fighter with -2 vampire level drain, Strength +3, +2 Longsword:
currentLevel = 8
Attack bonus = +8 class attack progression + 3 Strength + 2 weapon = +13.
```

## Alignment

Thornwrithe uses the D20 nine-alignment grid for moral and supernatural rules:

| Alignment | Code | Notes |
| --- | --- | --- |
| Lawful Good | `LG` | Honor, mercy, duty, and ordered justice. |
| Neutral Good | `NG` | Mercy and protection without strict allegiance to order or chaos. |
| Chaotic Good | `CG` | Freedom, rebellion, and compassion. |
| Lawful Neutral | `LN` | Law, order, oaths, and hierarchy without moral commitment. |
| True Neutral | `N` | Balance, instinct, survival, or detachment. |
| Chaotic Neutral | `CN` | Freedom, impulse, luck, and personal will. |
| Lawful Evil | `LE` | Tyranny, bargains, domination, and corrupt order. |
| Neutral Evil | `NE` | Selfish harm, hunger, predation, and malice. |
| Chaotic Evil | `CE` | Ruin, cruelty, frenzy, and destructive freedom. |

Rules that target Evil apply to `LE`, `NE`, and `CE`.

Mindless hazards may omit alignment. If a hazard has no moral agency, Holy does
not treat it as Evil unless its content record explicitly adds an Evil tag.

## Weapon Encyclopedia

Weapon damage is supplied by the equipped weapon, not the hero class. Class,
ability, feat, skill, and spell systems may later modify these values, but the
weapon table is the baseline.

| Weapon | Category | Damage | Critical | Notes |
| --- | --- | ---: | --- | --- |
| Dagger | Light | `1d4` | `19-20/x2` | Fast, concealable, rogue-friendly. |
| Club | Simple | `1d6` | `20/x2` | Common low-tier blunt weapon. |
| Quarterstaff | Simple | `1d6` | `20/x2` | Staff, ash staff, monk staff, or caster focus. |
| Mace | Simple | `1d8` | `20/x2` | Reliable blunt weapon against armored enemies. |
| Longsword | Martial | `1d8` | `19-20/x2` | Standard knightly blade. |
| Scimitar | Martial | `1d6` | `18-20/x2` | Curved blade with wide critical range. |
| Warhammer | Martial | `1d8` | `20/x3` | Narrow critical range, heavy critical impact. |
| Bastard Sword | Exotic | `1d10` | `19-20/x2` | One-handed with proficiency; otherwise treated as two-handed. |
| Katana | Exotic | `1d10` | `19-20/x2` | Precision exotic blade, mechanically parallel to bastard sword. |
| Greatsword | Martial Two-Handed | `2d6` | `19-20/x2` | Highest baseline weapon dice in the standard table. |

Implementation notes:

- Weapon IDs should be stable lowercase keys such as `greatsword`, `warhammer`,
  and `scimitar`.
- Do not add alternate spellings for canonical weapon keys.
- Critical range is stored as the lowest natural d20 roll that crits, such
  as `18` for scimitar and `20` for warhammer.
- Critical multiplier is stored as an integer such as `2` or `3`.

## Weapon Enhancement

Weapon enhancement represents magical accuracy and force.

- Valid weapon enhancement values are `+0`, `+1`, `+2`, `+3`, `+4`, and `+5`.
- `+5` is the hard cap for normal player gear.
- Item records above `+5` are invalid and should fail content validation.
- Weapon enhancement adds to attack rolls.
- Weapon enhancement adds to weapon damage rolls.
- Weapon enhancement determines whether a weapon can affect bosses with
  minimum-enhancement protection.

Examples:

```text
+1 Longsword
+3 Katana
+5 Holy Greatsword
```

## Holy Modifier

Holy is a weapon modifier, not an alignment by itself.

- A Holy weapon must be magical and should have at least `+1` enhancement.
- Against Evil targets (`LE`, `NE`, `CE`), Holy deals `2x` weapon damage.
- Against non-Evil targets, Holy grants no extra damage.
- Holy damage is resolved after critical multiplication.
- Holy does not double non-weapon riders unless that rider is explicitly marked
  as Holy weapon damage.

Damage order for a Holy weapon:

1. Roll weapon damage.
2. Add ability, enhancement, and weapon damage modifiers.
3. Apply the critical multiplier, if any.
4. Apply Holy `2x` multiplier if the target is Evil.
5. Apply target protection, resistance, or vulnerability.

Holy should be visually and textually loud: the combat log should say when the
weapon flares against Evil, and the HUD should show a short holy impact cue.

## Critical Hits

Critical hits are resolved on the attack roll. Thornwrithe does not use a
separate confirmation roll.

1. Roll the attack.
2. If the natural d20 is inside the weapon's critical range and the attack hits,
   the attack is a critical hit.
3. Multiply weapon damage by the weapon's critical multiplier.
4. If the attack misses, it is not a critical hit even if the natural d20 was
   inside the weapon's critical range.

Critical rules:

- A blocked attack cannot become a critical hit.
- A natural `20` crits only if the weapon can affect the target.
- Extra damage dice from poison, burning, or non-weapon spell riders are not
  multiplied unless the effect says otherwise.
- Holy is not a critical multiplier; it is a separate post-critical multiplier
  against Evil targets.

Example:

```text
Scimitar: 1d6, 18-20/x2
Attack roll: natural 18, total 24 vs AC 19
Result: critical hit
Damage roll: 4 + 3 Dexterity + 1 enhancement = 8
Critical damage: 8 x 2 = 16
```

## Mob Enhancement Protection

Enhancement protection is a boss-only rule. It creates the classic D20 fantasy
of needing a sufficiently enchanted weapon to harm a supernatural threat.

- Standard mobs must not have a minimum enhancement requirement.
- Elite mobs should not have a minimum enhancement requirement unless promoted
  to boss status.
- Only boss mobs may require enchanted weapons to hit.
- Boss minimum enhancement may be `+1`, `+2`, or `+3`.
- `+3` is the maximum requirement.
- A boss requiring `+3` can be damaged by `+3`, `+4`, or `+5` weapons.
- A weapon below the requirement cannot damage the boss, even if the attack roll
  meets the defense.

Recommended log text:

```text
Your +2 katana strikes the Vampire Lord, but its ward rejects the blade. A +3 weapon is required.
```

Implementation notes:

```json
{
  "rank": "boss",
  "minimumEnhancementToHit": 3
}
```

Invalid records:

```json
{ "rank": "standard", "minimumEnhancementToHit": 1 }
{ "rank": "boss", "minimumEnhancementToHit": 4 }
```

## Monster Rules

Monster records should expose enough rules data for combat, MUD logs, and the
`consider` command.

Required combat fields:

- `id`
- `name`
- `rank`: `minion`, `standard`, `elite`, or `boss`
- `alignment`
- `hp`
- `attackBonus`
- `damage`
- `defenses`

Optional boss fields:

- `minimumEnhancementToHit`
- `protectionTags`
- `resistances`
- `vulnerabilities`
- `specials`

Example boss:

```json
{
  "id": "vampire-lord",
  "name": "Vampire Lord",
  "rank": "boss",
  "alignment": "LE",
  "hp": 100,
  "attackBonus": 20,
  "damage": "3d6",
  "defenses": {
    "ac": 25,
    "fortitude": 20,
    "reflex": 23,
    "will": 24
  },
  "minimumEnhancementToHit": 3,
  "protectionTags": ["undead", "vampiric", "boss-ward"],
  "vulnerabilities": ["holy"]
}
```

Player-facing summary:

```text
Vampire Lord: +3 min enhancement to hit, 100 HP, +20 Attack, 3d6 damage.
```

## Skill Checks

Skill checks use the same D20 format as attacks:

```text
d20 + ability modifier + trained bonus + situational modifiers vs DC
```

Recommended initial skill set:

| Skill | Ability | Main Use |
| --- | --- | --- |
| Consider | Wisdom or Intelligence | Estimate enemy threat and protection. |
| Appraise | Intelligence | Identify item enhancement, modifier, and value. |
| Lore | Intelligence | Recall monster alignment, traits, and boss weaknesses. |
| Search | Wisdom | Find hidden caches, tracks, traps, and room clues. |
| Scout | Wisdom | Read nearby terrain, patrols, and danger level. |
| Pray | Wisdom or Charisma | Invoke shrines, blessings, wards, and holy effects. |
| Tactics | Intelligence | Compare defenses and predict the best attack mode. |
| Survival | Wisdom | Resist wilderness hazards and improve travel reads. |

Skill visibility should be MUD-friendly. A failed check should still produce
useful fiction, but less precision.

## Consider Skill

`consider` is the most important near-term MUD skill addition because it helps
players judge whether a fight is fair, dangerous, or blocked by protection.

Command forms:

```text
consider goblin
consider vampire lord
con troll
```

The command should compare the player to the target and report:

- relative threat band
- whether the target is standard, elite, or boss
- visible alignment if known or successfully checked
- estimated HP band
- estimated attack and damage band
- whether the player's equipped weapon can bypass enhancement protection
- useful hint when Holy or other modifiers matter

Example success:

```text
You consider the Vampire Lord.
Boss. Lawful Evil. About 100 HP.
It attacks at roughly +20 and rends for 3d6 damage.
Your +2 katana cannot pierce its ward. A +3 weapon is required.
Holy damage would be decisive here.
```

Example partial or failed read:

```text
You consider the shadowed noble.
It feels far beyond you. Your blade may not be enough.
```

Implementation guidance:

- `consider` should be usable before combat and during combat.
- The exact result can depend on skill success, line of sight, lore, and prior
  discoveries.
- The command should never lie about a hard enhancement gate once the player has
  bounced off that gate in combat.

## Equipment Commands

These MUD commands should accompany the weapon rules:

```text
inventory
equipment
wield greatsword
wear chainmail
appraise holy avenger
compare katana greatsword
consider vampire lord
```

Minimum expected output for equipped weapons:

```text
Wielded: The Holy Avenger, +5 Holy Greatsword, 2d6, 19-20/x2.
```

## Canonical Examples

### The Holy Avenger: +5 Holy Greatsword

Rules identity:

```json
{
  "id": "holy-avenger",
  "name": "The Holy Avenger",
  "slot": "weapon",
  "weaponType": "greatsword",
  "damage": "2d6",
  "enhancement": 5,
  "modifiers": ["holy"],
  "criticalRangeMin": 19,
  "criticalMultiplier": 2,
  "alignmentAffinity": "LG"
}
```

Player-facing summary:

```text
The Holy Avenger: +5 Holy Greatsword, 2d6 damage, 19-20/x2 critical, Holy.
Against Evil, it deals 2x weapon damage after criticals.
```

Damage example:

```text
Paladin Strength modifier: +4
Weapon: +5 Holy Greatsword
Target: Lawful Evil
Damage roll: 9 on 2d6
Normal weapon damage: 9 + 4 + 5 = 18
Holy damage vs Evil: 18 x 2 = 36
Critical vs Evil: (18 x 2) x 2 = 72
```

### Vampire Lord

Rules identity:

```json
{
  "id": "vampire-lord",
  "name": "Vampire Lord",
  "rank": "boss",
  "alignment": "LE",
  "hp": 100,
  "attackBonus": 20,
  "damage": "3d6",
  "minimumEnhancementToHit": 3
}
```

Player-facing summary:

```text
Vampire Lord: +3 min enhancement to hit, 100 HP, +20 Attack, 3d6 damage.
```

Combat example:

```text
Hero attacks with a +2 katana.
Attack total: 31 vs AC 25.
The attack would hit, but the Vampire Lord requires +3 enhancement.
Result: no damage, no critical, log the ward rejection.
```

### Warhammer Critical

```text
Weapon: +1 Warhammer, 1d8, 20/x3
Attack roll: natural 20, total 27 vs AC 18
Result: critical hit
Damage roll: 6 + 3 Strength + 1 enhancement = 10
Critical damage: 10 x 3 = 30
```

## Engine Data Contract

Recommended weapon item fields:

```json
{
  "id": "plus-one-warhammer",
  "name": "+1 Warhammer",
  "slot": "weapon",
  "weaponType": "warhammer",
  "damage": "1d8",
  "enhancement": 1,
  "modifiers": [],
  "criticalRangeMin": 20,
  "criticalMultiplier": 3,
  "effect": "+1 attack, +1 damage"
}
```

Recommended monster fields:

```json
{
  "id": "boss-id",
  "name": "Boss Name",
  "rank": "boss",
  "alignment": "NE",
  "hp": 100,
  "attackBonus": 20,
  "damage": "3d6",
  "defenses": {
    "ac": 25,
    "fortitude": 22,
    "reflex": 20,
    "will": 24
  },
  "minimumEnhancementToHit": 2,
  "resistances": [],
  "vulnerabilities": ["holy"]
}
```

Validation rules:

- `enhancement` must be an integer from `0` to `5`.
- `weaponType` must exist in the weapon table.
- `damage` must match the weapon table unless a named artifact explicitly
  overrides it.
- `criticalRangeMin` must be between `18` and `20`.
- `criticalMultiplier` must be `2` or `3` for the initial weapon set.
- `minimumEnhancementToHit` must be omitted or `0` for non-boss monsters.
- Boss `minimumEnhancementToHit` must be `1`, `2`, or `3` when present.
- Alignment must be one of `LG`, `NG`, `CG`, `LN`, `N`, `CN`, `LE`, `NE`, `CE`.

## Combat Log Requirements

Good logs are part of the game design, not debug leftovers. The resolver should
emit enough detail for players to understand every important outcome.

Required log details:

- natural d20 roll
- total attack value
- target defense
- hit, miss, critical, or block
- weapon damage roll
- enhancement bonus
- critical multiplier when applied
- Holy multiplier when applied
- boss protection failure when relevant

Example:

```text
You swing The Holy Avenger at the Vampire Lord: d20 19 + 12 = 31 vs AC 25, critical.
Damage: 2d6 9 + 4 STR + 5 enhancement = 18, x2 critical, x2 Holy vs Evil = 72.
```

## HUD And Graphics Requirements

The graphics layer should make D20/MUD rules legible without hiding the playfield.

Recommended visual cues:

- weapon trait icon beside the equipped weapon: Holy, critical range, and
  enhancement tier
- brief critical flash on the target token
- holy impact flare only when the target is Evil
- boss ward shimmer when enhancement protection blocks damage
- compact `+3 required` badge on boss inspect or consider output
- color-coded alignment chip in the target panel once known
- combat log emphasis for `critical`, `holy`, and `warded`

The DOM HUD should continue to carry the text-heavy rules, while Phaser owns the
playfield, token motion, target flashes, and short-lived effects.

## Best Next Gameplay Additions After 1.8.0

1. Add equipment commands and item comparison so weapon choice becomes visible
   and changeable during play.
2. Add Appraise and Lore checks to reveal item and monster rule data outside
   immediate combat.
3. Add weapon and target rule chips to the HUD for enhancement, critical range,
   alignment, Holy, and boss wards.
4. Add Phaser effects for critical hits, Holy damage, and boss ward rejection.
5. Add progression-safe loot placement for scimitar, katana, bastard sword,
   warhammer, greatsword, and The Holy Avenger.
6. Add one `+1` boss, one `+2` boss, and one `+3` capstone boss only after the
   matching weapon progression exists.
7. Persist known monster facts or recently discovered protection hints where
   useful.

## Implementation Roadmap

Phase 1: content schema and static validation. Implemented in `1.6.0`.

- Add weapon fields to item schema.
- Add monster `rank`, `alignment`, and optional boss protection fields.
- Reject item enhancements above `+5`.
- Reject non-boss enhancement gates.
- Add unit tests for valid and invalid content records.

Phase 2: combat resolver. Implemented in `1.6.0`.

- Replace class-only hero damage dice with equipped weapon damage.
- Add weapon enhancement to attack and damage from the weapon record.
- Add critical range detection and multiplier application.
- Add Holy damage against Evil targets.
- Add boss enhancement protection before damage and critical resolution.
- Extend combat log entries with critical, Holy, and protection details.

Phase 3: MUD commands and skills. Started in `1.6.0`.

- `consider <target>` is implemented.
- Add `inventory`, `equipment`, `wield`, `appraise`, and `compare` command
  support as the equipment system matures.
- Persist known monster facts or recently discovered protection hints where
  useful.

Phase 4: content and balance. Started in `1.6.0`.

- Baseline weapons across the `1d4` to `2d6` band are present in content.
- The Holy Avenger is present as a `+5 Holy Greatsword` artifact.
- The Vampire Lord is present as a `+3` enhancement-gated boss reference.
- Add one `+1` boss and one `+2` boss before making the Vampire Lord reachable.
- Keep the first-session path free of hard enhancement gates until the player
  can reasonably obtain the required weapon.

Phase 5: level progression. Implemented in `1.7.0`.

- Add the level 1-15 XP table.
- Derive level from total XP when XP is awarded or checkpoints are normalized.
- Cap explicit or loaded level values at level 15.
- Document class attack progression through the current cap.

Phase 6: JSON-backed rules and effective levels. Implemented in `1.8.0`.

- Move XP progression, class attack tables, class base stats, weapon type
  defaults, combat constants, and alignment labels into `content/rules/*.json`.
- Use precomputed per-level attack tables instead of runtime multipliers.
- Distinguish XP-derived `realLevel` from effect-adjusted `currentLevel`.
- Use `currentLevel` for combat attack progression and vision.
- Hydrate weapon item damage and critical fields from canonical weapon rules.

Phase 7: UX and graphics.

- Add weapon and target rule chips to the HUD.
- Add critical and Holy effects to the Phaser playfield.
- Add boss ward block feedback to both canvas and text logs.
- Playtest desktop and mobile for text fit, readable logs, and target clarity.
