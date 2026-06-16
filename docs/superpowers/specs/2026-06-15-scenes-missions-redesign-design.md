# Scenes, Missions & Scoring Redesign

Date: 2026-06-15

## Goal

Make the blimp trainer's objectives meaningful and add explorable worlds, without
touching the locked flight model. Specifically:

- Replace the opaque 1000-point score-decay with clear challenges that end in a
  readable **result card** and a Bronze/Silver/Gold medal.
- Make rings **respond**: the next ring glows and shows an arrow, cleared rings turn
  green, upcoming rings stay neutral.
- Add a guided **Tutorial** that coaches a new pilot through each control.
- Add switchable **scenes**: the existing indoor Arena, a procedural **Nature** world
  (hills, trees, rivers, lakes, grass, rocks) with a **Regenerate** button, and a
  procedural **City** world.
- Outdoors: free-flight sandbox plus a toggleable, regenerable ring course.

## Locked (do not modify behaviourally)

- `src/sim/physics.ts` — flight model.
- `src/sim/input.ts` — controls / gamepad mapping.
- `src/config/blimpConfig.ts` — real-blimp default values (still user-tunable in Settings).

Per-scene `windStrength` is a *preset* of the existing config field (Arena 0.42,
Nature 0.6, City 0.7), overridable in Settings — the model math is untouched.

## Architecture: World abstraction

A `World` interface; each environment implements it. `SimulatorApp` holds the active
world and swaps it on scene change.

```
World {
  id: 'arena' | 'nature' | 'city'
  group: THREE.Group
  colliders: AabbCollider[]
  groundHeightAt(x, z): number        // surface Y for collision + spawn
  isWaterAt(x, z): boolean            // water surface => contact fault
  ceilingAt(x, z): number             // arena: maxArenaHeight; outdoor: high
  ringAnchors: RingAnchor[]           // suggested course points
  spawn: Vector3
  defaultCamera: CameraMode
  defaultWind: number
  bounds: { maxY, ... }
  environment: { background, fog, hemisphere, sun }  // applied on switch
  update(time): void
  dispose(): void
}
```

Worlds: `ArenaWorld` (refactor of current static venue), `NatureWorld`, `CityWorld`.
`createWorld(id, seed, config)` factory. Procedural worlds take a numeric seed; the
same seed reproduces the same world (Regenerate = new seed + rebuild world group only;
blimp and camera persist).

## New / changed units

- `sim/rng.ts` — seeded PRNG (deterministic; unit-tested) + helpers.
- `scene/procedural/noise.ts` — seeded 2D value noise (fBm) for terrain.
- `scene/procedural/terrain.ts` — `Terrain`: displaced vertex-coloured plane, water
  level, `heightAt`/`isWaterAt`. Lakes fill basins; a river is a carved channel.
- `scene/procedural/scatter.ts` — trees / rocks / grass as `InstancedMesh` (off steep
  slopes and water).
- `scene/procedural/city.ts` — block grid of buildings (instanced, varied height/colour,
  window textures), streets, parks; buildings are AABB colliders.
- `scene/worlds/*` — the World interface + three implementations + factory.
- `scene/rings.ts` — `RingCourse`: ring visuals with state (upcoming / next / cleared),
  pulsing next ring + floating arrow. Reused by indoor Ring Run and outdoor course.
- `scene/markers.ts` — `TargetMarker` (beacon beam + ground ring) and `StationBox`
  (translucent hold box) used by missions in any world.
- `sim/missionTypes.ts` — shared `MissionView` / `MissionResult` / `Medal`.
- `sim/challenges.ts` — `ChallengeRun` producing a `MissionView`; medals from
  explainable thresholds. Replaces `TrainingSession`.
- `sim/tutorial.ts` — `Tutorial`: ordered coached steps, each with instruction, hint,
  marker, and an auto-advance hold condition. Produces the same `MissionView`.
- `app/SimulatorApp.ts` — owns active world + active mission + a separate `missionGroup`
  for mission visuals; wires scene switch, Regenerate, activity switch, default camera.
- `app/ui.ts` — objective banner + coaching hint line, live progress
  (`Ring 2/6 · 0:14 · 0 contacts`), result-card overlay with medal, Scene selector,
  Activity selector (scene-dependent), Regenerate button.
- `sim/collisions.ts` — add `resolveSurfaceCollisions(state, config, surface, colliders)`
  using a `SurfaceSampler` (ground/ceiling/water). `resolveArenaCollisions` becomes a
  thin flat-ground wrapper so existing tests stay green. Water contact => `water` fault.
- `style.css` — banner, hint, progress, result card, medal styles.
- Remove `scene/environment.ts`, `sim/training.ts`, `sim/training.test.ts`.

Rings, station box, target markers are **mission visuals** (in `missionGroup`), not baked
into the world — so any challenge/tutorial works in any compatible scene.

## Activities per scene

- **Arena:** Tutorial, Station Keeping, Ring Run, Spot Landing, Stage Pass, Nose-In Hold.
- **Nature / City:** Free Flight (+ toggleable ring course), Tutorial, Station Keeping,
  Ring Run, Spot Landing. (Stage Pass and Nose-In are arena-only.)

## Challenges & medals (explainable)

- **Station Keeping** — hold inside a generous box (±4m H, ±2m V) continuously for 15s;
  leaving resets the streak. Medal by avg centre error during the hold + contacts.
- **Ring Run** — pass all rings in order (inside radius). Medal by total time vs a par
  (course length / cruise) + contacts.
- **Spot Landing** — settle inside a ground ring under low speed for 2s. Medal by final
  distance from centre + contacts.
- **Stage Pass** (arena) — slow clean pass through the stage lane in an altitude band,
  no contacts. Medal by contacts + smoothness.
- **Nose-In Hold** (arena) — keep the nose pointed at the pilot camera while holding
  position for a duration. Medal by avg yaw error + contacts.

Result card lists time, rings/objective metric, contacts, and the medal. Live HUD shows
progress, never a mystery number.

## Tutorial steps (scene-agnostic, markers relative to spawn)

1. Throttle & altitude — climb into and hold an altitude band (4s).
2. Yaw to face — point the red nose at a beacon (yaw error < 12° for 3s).
3. Forward & stop — ease to a marker and let it drift to a stop (<2m, slow, 2s).
4. Gentle turn — combine yaw + forward to reach an offset marker.
5. Ring approach — pass slowly through one ring. Then "Tutorial complete."

## Performance

InstancedMesh for all scatter/buildings; one displaced plane for terrain; a couple of
translucent planes for water; fog hides world edges. Dispose geometries/materials on
scene switch and Regenerate to avoid GPU leaks. Target 60 fps.

## Testing

- `rng.test.ts` — determinism (same seed => same sequence) and range bounds.
- `challenges.test.ts` — completion + medal thresholds for representative runs
  (replaces `training.test.ts`).
- `terrain.test.ts` — `heightAt` is finite/bounded and water flag consistent.
- Keep `collisions.test.ts`, `physics.test.ts`, `input.test.ts`, `blimpConfig.test.ts`
  green. Verify with `tsc --noEmit`, `vitest run`, and a production `vite build`.
