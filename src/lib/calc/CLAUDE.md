# Game rules the engine encodes

These were established with the user over several rounds. Most are non-obvious
and several contradict a naive reading of the data.

**Souls and the timeline.** A build is an *ordered purchase plan*, not a set. A
souls-earned slider walks it.
- Souls earned is monotonic and drives boons. **Selling refunds 50% into your
  pocket but is not income**, so it never raises boons.
- Components are **absorbed** on upgrade (pay the difference, no refund), so a
  plan can legitimately list Extended Magazine *and* Titanic Magazine.
- 12 slots. The user authors a **sell order**; if one is needed and missing, the
  app sells the earliest purchase, marks the step `?`, and warns.

**Conditional bonuses.** A conditional block **with its own cooldown** is a brief
proc window → defaults **off**. Without one it is a state you hold → defaults
**on**. This single rule reproduces every judgement the workbook made by hand
(Spiritual Overflow on, Counterspell off, Alchemical Fire's shred off).

**Headshots.** +65% weapon damage, plus item bonuses on top.
- **Spirit damage on a bullet gains nothing** from a headshot.
- **Bonuses add, they do not compound**: a Lucky Shot proc on a headshot is
  165% + 100% = 265%, *not* 330%. A proc's contribution therefore does not move
  with headshot rate at all.
- Assassinate has its own +20%, separate from the gun's 65%, applied to its
  *total* (base + execute bonus combined), not just the base.

**Damage types.** A bullet has a weapon half and a spirit half that meet
different resists and must be shredded separately. Resist shred stacks
multiplicatively: `1 - Π(1 - shred)`.

**Enemy Resist and shred are two different numbers that combine before they
touch damage.** Per deadlock.wiki/Damage_Resistance: the target's own resist
and your shred each stack multiplicatively *within themselves*, then shred is
*subtracted* from resist, and `damage taken = raw × (1 − (resist − shred))`.
`build.enemyBulletResistPct`/`enemySpiritResistPct` (two sliders, default 0
each — a target can be built to resist one and not the other, same as your
own shred is tracked per type) are the target's resist;
`bulletResistShred`/`spiritResistShred` remain pure "how much you strip,"
untouched by the sliders. The two combine into
`bulletResistMul`/`spiritResistMul` right where the old `(1 + shred)` used to
be, floored at 0 so an over-resisted target can't show negative damage. At
the default 0% this is arithmetically identical to the app's original
formula — shred alone, read as negative resist — which is why every existing
test still passes unmodified. **Escalating Exposure's spirit amp is not
resist shred** — it multiplies the *raw* damage before the resist/shred term
is applied at all (spiritAmp lives in `mkDamage`'s `spirit` input, upstream
of `bulletResistMul`/`spiritResistMul`), same as any other spirit-amp source.

**Assassinate is entirely spirit damage**, fired from the gun but not weapon
damage — base shot and the execute bonus against targets below 50% health are
both spirit-scaled and both get spirit resist shred and spirit amp (e.g.
Escalating Exposure). Its own `gunDamagePerStack` passive ("kills grant +6%
weapon damage per stack") buffs the *regular gun*, not Assassinate itself —
snipe stacks move `bulletDamage`, never `damageProfiles`. Confirmed with the
user after an earlier session had it backwards as weapon-typed.

**Ability cooldown reduction applies after ability-tier deltas, not before.**
`resolveAbility` folds a taken upgrade's `cooldownDelta` into the ability's
cooldown first (Stake T2: 40s → 18s); only then does the item/imbue
`cooldownReductionPct` percentage multiply that result (18s × (1 − 25%) =
13.5s), never the other way around.

**Procs** (Lucky Shot, Tesla, Capacitor) are folded into headline DPS as an
expected value per bullet, and also listed per item. The two must agree — a test
asserts it.

**Ricochet** is reported separately, never folded in: it lands on *other*
targets. Weapon damage carries at 65%, spirit damage in full.

**Imbue items** assign to one ability. Their ability-scoped stats apply only
there (Compress Cooldown shortens one cooldown, not all four); anything in an
`Innate` block stays global. Imbuing **Flight** is the case that is easy to
break — its bonus is bullet damage, so it must read Flight's imbued spirit, not
the global figure.

**Damage multipliers** add rather than compound: 0.86 and 0.9 give 0.76.

**Mercurial Magnum** per-bullet bonus is a *percentage of base gun damage*:
`(0.25 + spirit × 0.0049) × base gun damage × spirit amp` (workbook `E35`). The
export's "25" is 25 percent, and the 0.49%/spirit scaling is not in the export
at all.
