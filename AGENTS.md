# AGENTS.md — Engineering Guide for AI Agents & Contributors

This repository implements an interactive 3D Toyota 5th-Gen Hybrid System (THS V) Power Split Device visualizer and driving simulator modeled after a **Toyota Kijang Innova Zenix Hybrid (AG10) with 4 adult passengers (2,020 kg laden)**.

Follow these architectural rules strictly so domain logic remains deterministic, unit-testable in Node without a browser, and decoupled from React/Three.js rendering.

---

## 1. Strict Layer Boundaries

| Layer | Directory | Allowed Dependencies | Forbidden Dependencies |
| :--- | :--- | :--- | :--- |
| **Domain Types** | `src/types/` | Pure TypeScript types/constants | React, Three.js, DOM, simulation logic |
| **Drivetrain Logic** | `src/drivetrain/` | `src/types/`, `src/autodrive/idleStatus` | React, Three.js, Web Audio, `window`/`document` |
| **AutoDrive Logic** | `src/autodrive/` | `src/types/` | React, Three.js, `src/drivetrain` runtime internals |
| **Backend Session Engine** | `src/engine/hybridSimulationSession.ts` | `src/types/`, `src/drivetrain/`, `src/autodrive/` | React, Three.js, DOM globals (`window`) |
| **React Hook Adapter** | `src/engine/useHybridSimulation.ts` | React, `hybridSimulationSession`, `src/audio/` | Physics formulas or Three.js scene mutation |
| **3D Scene & Audio** | `src/three/`, `src/audio/` | Three.js / Web Audio API, `src/types/`, `src/drivetrain/` constants | React JSX, mutating simulation state |
| **UI Presentation** | `src/components/`, `src/App.tsx` | React, Lucide, `src/types/`, `src/engine/`, read-only `src/drivetrain` constants | Direct physics integration loops or AutoDrive state machines |

> **Rule of Thumb:** Any change to physics, hybrid ECU thresholds, fuel economy, or AutoDrive behavior MUST be implemented inside `src/drivetrain/` or `src/autodrive/` and verified directly by `npm test` without needing a DOM.

---

## 2. Non-Negotiable Physics & Mechanical Invariants

1. **Exact Willis Planetary Identity (Always True):**
   $$30 \cdot \omega_{\text{MG1}} + 78 \cdot \omega_{\text{Ring}} = 108 \cdot \omega_{\text{ICE}}$$
   Every frame in Drive, Preset Modes, and Manual Kinematics must satisfy this identity within floating-point tolerance (`< 1e-4 RPM`).
2. **Mechanical Spin Direction Rules:**
   - **ICE (`Carrier`)** spins **CW only (`>= 0 RPM`)**. Never allow negative/CCW ICE RPM in either driving physics or the manual kinematics solver.
   - **MG1 (`Sun`)** spins **both CW (`+`) and CCW (`-`)**, capped around `±10,500 RPM`.
   - **MG2 / Ring / Wheel** spins **CW (`+`)** for Forward (`D`/`B`) and **CCW (`-`)** for Reverse (`R`).
3. **Power Balance & Conservation:**
   - Planetary mechanical carrier power: `carrierToRingKw + carrierToSunKw ≈ iceToCarrierKw`.
   - PCU electrical bus balance (including `READY_AUX_LOAD_KW = 0.90 kW` cabin A/C & 12V load):
     `batteryToPcuKw ≈ pcuToMg2Kw + READY_AUX_LOAD_KW - mg1ToPcuKw`.
   - Countershaft wheel output: `counterToWheelKw ≈ carrierToRingKw + mg2ToCounterKw`.
4. **Neutral (`N`) vs Park (`P`) READY Behavior:**
   - In **`P`**, parking pawl locks Ring/Wheels at `0 RPM`, **inverters remain ACTIVE** (`<40%` SoC triggers `IDLE_CHARGE` up to `48%`), and READY A/C+12V consumes `0.9 kW`.
   - In **`N`**, **MG1 & MG2 inverter gates are de-energized** (`0 kW` charge/regen), while `0.9 kW` READY aux draw still depletes the NiMH pack.
5. **Fuel Cut on Deceleration & B-Mode Pumping:**
   - Lifting off throttle or braking cuts fuel immediately (`iceFuelActive = false`, `instantFuelLph = 0`), even when `B`-range spins ICE at high RPM as an unfueled air pump.

---

## 3. UI & UX Guardrails (User-Approved Layout)

- **Bottom Dock (`src/components/dock/DriveSimulatorTab.tsx`):**
  - Keep **Column 1** (`P/R/N/D/B` + `EV Mode` + `AutoDrive`) and **Column 5** (`CarEnergyFlowPreview`) layout-locked.
  - Keep the **2-row Telemetry Banner** (`StatusTelemetryBanner`) placed strictly **below the top tab bar** and **above the dock surface**.
  - **Hybrid Power Meter** column stays full height with no extra labels below the meter.
- **Manual Tab (`src/components/dock/ManualShaftTab.tsx`):**
  - Keep full slider bar width for all 3 shafts; keep ICE left half blocked (`>= 0` only) and its `CCW` button permanently disabled with strikethrough.
- **Top Viewport Toolbar & Logs (`src/components/PowertrainViewport.tsx` & `PsdLogModal.tsx`):**
  - `Slow-Mo` order: `Auto · 1x · 0.5x · 0.25x`.
  - Enabling `Auto` Slow-Mo defaults transition log notifications **ON**; disabling `Auto` Slow-Mo defaults them **OFF**.
  - Keep `PSD Log` entry buffer capped strictly at **`100`** entries (`MAX_LOG_ENTRIES`), without showing an entry counter badge on the `PSD Log` button.

---

## 4. Common Extension Recipes

- **Add a New THS-5 Operating Mode:** Add enum value to `OperationModeId` (`src/types/hybrid.ts`), add balanced spec to `OPERATION_MODES` (`src/drivetrain/operationModes.ts`), then run `npm test` to verify Willis and PCU conservation checks pass.
- **Add a New AutoDrive Traffic/Terrain Situation:**
  1. Add key to `AutoDriveEventKind` (`src/types/hybrid.ts`).
  2. Add duration/grade/speed config & status copy in `src/autodrive/scenarios.ts`.
  3. Wire weighted transition probabilities in `AutoDriveController` (`src/autodrive/autoDriveController.ts`).
  4. Map badge styling in `src/components/dock/autoDriveBadges.ts`.
  5. Run `npm test` (exercises multi-minute City/Hwy/Mtn stress & transition checks).
- **Tune Vehicle / Drivetrain Parameters:** Edit constants or control laws in `src/drivetrain/vehicleSpecs.ts` or `src/drivetrain/drivingPhysics.ts`, then run `npm test` to verify the Toyota Innova Zenix Hybrid audit metrics stay within reference targets.

---

## 5. Mandatory Verification Before Submitting Changes

Always execute all three checks in order and confirm exit code `0`:

```bash
npm test       # 126+ assertions: Willis, 10 modes, Zenix 2,020kg audit, AutoDrive stress
npm run lint   # Full TypeScript strict check (tsc --noEmit)
npm run build  # Production Vite bundle check
```
