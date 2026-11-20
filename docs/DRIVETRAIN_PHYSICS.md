# Drivetrain Physics & Innova Zenix Hybrid Reference Audit

## 1. Planetary Gearset Mechanics (THS V)

The Toyota Power Split Device (PSD) is a single-pinion Ravigneaux-style simple planetary gearset coupling three coaxial members:

- **Sun Gear (`Z_S = 30`):** Rigidly splined to **MG1** (`1VM-G`, generator / starter motor).
- **Planetary Carrier (`C`, 4× `Z_P = 24` planets):** Rigidly coupled via damper to the **2.0L `M20A-FXS` Atkinson ICE** (clockwise rotation only: `ω_ICE ≥ 0`).
- **Ring Gear (`Z_R = 78`):** Rigidly coupled to the compound **MG2 reduction & countershaft output gear (`40T`)**.

### Kinematic Constraint (Willis Equation)
$$Z_S \omega_{\text{MG1}} + Z_R \omega_{\text{Ring}} = (Z_S + Z_R) \omega_{\text{ICE}}$$
$$30 \omega_{\text{MG1}} + 78 \omega_{\text{Ring}} = 108 \omega_{\text{ICE}}$$

Derived relations used across all simulation modes:
- **Planet Self-Spin (relative to Carrier):** $\omega_P = -(\omega_{\text{MG1}} - \omega_{\text{ICE}}) \cdot \frac{30}{24}$
- **Overdrive Crossing ($\omega_{\text{MG1}} < 0$ while ICE runs):** Occurs whenever $\omega_{\text{Ring}} > \frac{108}{78}\omega_{\text{ICE}} \approx 1.3846\,\omega_{\text{ICE}}$. In this region MG1 draws small electrical power from MG2 regeneration to react Carrier torque in reverse rotation.

### Torque & Power Split
A frictionless carrier reaction distributes ICE torque $\tau_{\text{ICE}}$ strictly in fixed tooth ratio:
- $\tau_{\text{Ring}} = \frac{78}{108}\,\tau_{\text{ICE}} = 72.22\%$ (direct mechanical traction path)
- $\tau_{\text{MG1}} = \frac{30}{108}\,\tau_{\text{ICE}} = 27.78\%$ (electro-mechanical variator path)

Mechanical shaft power splits proportionally to angular velocity:
$$P_{\text{Carrier}\to\text{Ring}} = \tau_{\text{Ring}} \omega_{\text{Ring}}, \qquad P_{\text{Carrier}\to\text{Sun}} = \tau_{\text{MG1}} \omega_{\text{MG1}}$$
with exact conservation $P_{\text{ICE}} = P_{\text{Carrier}\to\text{Ring}} + P_{\text{Carrier}\to\text{Sun}}$.

---

## 2. Reference Vehicle Parameters (Innova Zenix Hybrid AG10 + 4 Adults)

- **Mass:** `1,730 kg` kerb + `4 × 72.5 kg` passengers = **`2,020 kg`**
- **Aerodynamic Drag:** $F_{\text{aero}} = \frac{1}{2} \rho C_d A v^2$ (`ρ = 1.225 kg/m³`, `Cd = 0.32`, `A = 2.75 m²`)
- **Rolling Resistance:** $F_{\text{roll}} = C_{rr} m g \cos\theta$ (`Crr = 0.0110`)
- **Front-Axle Dynamic Traction Limit (FWD):**
  $\mu_{\text{dry}} = 0.82$, static front weight `47%`, dynamic rearward load transfer during grade climbs and acceleration (`~6,400–6,900 N` peak front tire traction force).
- **READY Auxiliary Load (`0.90 kW`):** Continuous HV DC bus draw for inverter cabin A/C compressor (`~0.55 kW`) and 12V DC-DC infotainment/pumps (`~0.35 kW`) in all READY gears (`P/R/N/D/B`).

---

## 3. Pedal Progression & ECB Cooperative Braking

- **Throttle Pedal Curve (`evaluateThrottlePedalCurve`):** $0.36 t + 0.64 t^{1.48}$ layered over a continuous low-speed EV creep floor (`~560 N` at standstill tapering to `0` by `7.8 km/h`), paired with `0.45 s` M20A-FXS cranking spool delay while MG2 delivers instant electric launch torque.
- **ECB Cooperative Braking (`evaluateBrakePedalFraction`):** $0.42 b + 0.58 b^{1.35}$ allocating `100%` of light-to-moderate brake demand (`≤ 50%` pedal, `≤ 32 kW`) to MG2 regeneration above `7.5 km/h`, fading smoothly into 4-wheel hydraulic pads between `2.5–7.5 km/h` and scaling up to `0.92g` ABS panic braking at `100%` pedal.

---

## 4. Quantitative Reference Audit Summary

All benchmarks below are automatically verified by `npm test` (`tests/drivingAndZenixAudit.test.ts` & `tests/autoDriveAndSession.test.ts`):

| Benchmark | Audited Simulation Result | Real-World Zenix Hybrid Reference |
| :--- | :--- | :--- |
| **Laden Mass** | `2,020 kg` | `1,730 kg` kerb + 4 adults (`290 kg`) |
| **0–100 km/h (WOT, 4 Adults)** | **`11.08 s`** | `~9.8 – 11.5 s` (laden MPV vs ~9.8 s 1-up) |
| **Governed Top Speed** | **`171.5 km/h`** | `~172 – 175 km/h` electronic governor |
| **Peak Net Wheel Power** | **`123.1 kW`** (`173 hp` countershaft / `~184 hp` combined system) | `186 PS (137 kW)` gross combined system |
| **100 km/h Steady Overdrive Cruise** | **`18.5 km/L`** (`ICE 1,565 RPM`, `MG1 -809 RPM`) | `17.5 – 21.0 km/L` real highway cruise |
| **Dynamic City AutoDrive Cycle** | **`~15 – 22 km/L`** | `16 – 24 km/L` urban hybrid stop-and-go |
| **100 → 0 km/h Braking (100% ABS)** | **`41.8 m`** / **`2.98 s`** (`0.92g` tire limit) | `~40 – 44 m` dry 215/60R17 radial |
| **100 → 0 km/h Regen (35% pedal)** | Stops cleanly `< 10 s`, **`+5.89%` NiMH SoC** recovered | Regenerative + hydraulic brake blending |
| **Park (`P`) vs Neutral (`N`)** | `P` charges `<40% -> 48%`; `N` disables inverters & drains `0.9 kW` | Exact Toyota THS V inverter protection |
