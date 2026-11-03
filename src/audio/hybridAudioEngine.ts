import { PowertrainState } from '../types/hybrid';

/**
 * Procedural Web Audio synthesizer modeling the real acoustic signature of a
 * 5th-Generation Toyota Hybrid System (THS V):
 *  1. Low-speed EV Pedestrian Acoustic Vehicle Alerting System (AVAS harmonic chord, 1–34 km/h)
 *  2. PCU Inverter & MG2 / MG1 Electric Motor / Regenerative Braking Whine
 *  3. 2.0L 4-Cylinder Atkinson ICE Combustion vs. Fuel-Cut B-Mode Air-Pumping Compression
 *  4. Subtle Tire / Dynamometer Rolling Sound
 */
export class HybridAudioEngine {
  private ctx: AudioContext | null = null;
  private enabled = false;
  private initialized = false;

  private masterGain!: GainNode;

  // 1. Toyota Low-Speed EV AVAS Harmonic Chord
  private avasOsc1!: OscillatorNode;
  private avasOsc2!: OscillatorNode;
  private avasGain!: GainNode;

  // 2. MG2 Traction / Regen Whine + MG1 Generator / Starter Whine
  private mg2Osc!: OscillatorNode;
  private mg2HarmOsc!: OscillatorNode;
  private mg2Gain!: GainNode;

  private mg1Osc!: OscillatorNode;
  private mg1Gain!: GainNode;

  // 3. 4-Cylinder Atkinson ICE (Fueled Combustion + Fuel-Cut Pumping)
  private iceCombOsc!: OscillatorNode;
  private iceSubOsc!: OscillatorNode;
  private iceFilter!: BiquadFilterNode;
  private iceCombGain!: GainNode;

  private pumpNoiseFilter!: BiquadFilterNode;
  private pumpGain!: GainNode;

  // 4. Road / Tire Roll
  private roadFilter!: BiquadFilterNode;
  private roadGain!: GainNode;

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!this.ctx || !this.initialized) return;

    const now = this.ctx.currentTime;
    if (!enabled) {
      this.masterGain.gain.setTargetAtTime(0, now, 0.04);
    } else {
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      this.masterGain.gain.setTargetAtTime(0.32, now, 0.06);
    }
  }

  public unlock(): void {
    if (!this.enabled) return;
    if (!this.initialized) {
      this.initGraph();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  private initGraph(): void {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    try {
      const ctx = new AudioCtx();
      this.ctx = ctx;

      this.masterGain = ctx.createGain();
      this.masterGain.gain.value = this.enabled ? 0.32 : 0;

      // Gentle master limiter/compressor so combined layers stay silky & distortion-free
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -14;
      compressor.knee.value = 18;
      compressor.ratio.value = 6;
      compressor.attack.value = 0.005;
      compressor.release.value = 0.15;

      this.masterGain.connect(compressor);
      compressor.connect(ctx.destination);

      // --- 1. Toyota EV AVAS Chord (293 Hz + 440 Hz warm futuristic fifth) ---
      this.avasOsc1 = ctx.createOscillator();
      this.avasOsc1.type = 'sine';
      this.avasOsc1.frequency.value = 294;

      this.avasOsc2 = ctx.createOscillator();
      this.avasOsc2.type = 'triangle';
      this.avasOsc2.frequency.value = 441;

      const avasFilter = ctx.createBiquadFilter();
      avasFilter.type = 'lowpass';
      avasFilter.frequency.value = 950;

      this.avasGain = ctx.createGain();
      this.avasGain.gain.value = 0;

      this.avasOsc1.connect(avasFilter);
      this.avasOsc2.connect(avasFilter);
      avasFilter.connect(this.avasGain);
      this.avasGain.connect(this.masterGain);

      this.avasOsc1.start();
      this.avasOsc2.start();

      // --- 2A. MG2 Traction & Regen Inverter Whine ---
      this.mg2Osc = ctx.createOscillator();
      this.mg2Osc.type = 'sine';
      this.mg2Osc.frequency.value = 220;

      this.mg2HarmOsc = ctx.createOscillator();
      this.mg2HarmOsc.type = 'triangle';
      this.mg2HarmOsc.frequency.value = 660;

      const mg2HarmScale = ctx.createGain();
      mg2HarmScale.gain.value = 0.25;

      this.mg2Gain = ctx.createGain();
      this.mg2Gain.gain.value = 0;

      this.mg2Osc.connect(this.mg2Gain);
      this.mg2HarmOsc.connect(mg2HarmScale);
      mg2HarmScale.connect(this.mg2Gain);
      this.mg2Gain.connect(this.masterGain);

      this.mg2Osc.start();
      this.mg2HarmOsc.start();

      // --- 2B. MG1 Sun Generator / Cranking Whine ---
      this.mg1Osc = ctx.createOscillator();
      this.mg1Osc.type = 'sine';
      this.mg1Osc.frequency.value = 320;

      this.mg1Gain = ctx.createGain();
      this.mg1Gain.gain.value = 0;

      this.mg1Osc.connect(this.mg1Gain);
      this.mg1Gain.connect(this.masterGain);
      this.mg1Osc.start();

      // --- 3A. 4-Cylinder Atkinson ICE Combustion ---
      this.iceCombOsc = ctx.createOscillator();
      this.iceCombOsc.type = 'sawtooth';
      this.iceCombOsc.frequency.value = 42;

      this.iceSubOsc = ctx.createOscillator();
      this.iceSubOsc.type = 'triangle';
      this.iceSubOsc.frequency.value = 21;

      const subMix = ctx.createGain();
      subMix.gain.value = 0.55;

      this.iceFilter = ctx.createBiquadFilter();
      this.iceFilter.type = 'lowpass';
      this.iceFilter.frequency.value = 180;
      this.iceFilter.Q.value = 1.8;

      this.iceCombGain = ctx.createGain();
      this.iceCombGain.gain.value = 0;

      this.iceCombOsc.connect(this.iceFilter);
      this.iceSubOsc.connect(subMix);
      subMix.connect(this.iceFilter);
      this.iceFilter.connect(this.iceCombGain);
      this.iceCombGain.connect(this.masterGain);

      this.iceCombOsc.start();
      this.iceSubOsc.start();

      // --- Shared Looping Noise Buffer (for B-Mode Fuel-Cut Pumping & Road Roll) ---
      const sampleRate = ctx.sampleRate;
      const noiseLen = sampleRate * 2;
      const noiseBuf = ctx.createBuffer(1, noiseLen, sampleRate);
      const data = noiseBuf.getChannelData(0);
      let b0 = 0;
      let b1 = 0;
      let b2 = 0;
      for (let i = 0; i < noiseLen; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.997 * b0 + white * 0.029;
        b1 = 0.985 * b1 + white * 0.032;
        b2 = 0.95 * b2 + white * 0.048;
        data[i] = (b0 + b1 + b2 + white * 0.04) * 0.7;
      }

      // --- 3B. Fuel-Cut Engine Air-Pumping / Cranking Compression ---
      const pumpSource = ctx.createBufferSource();
      pumpSource.buffer = noiseBuf;
      pumpSource.loop = true;

      this.pumpNoiseFilter = ctx.createBiquadFilter();
      this.pumpNoiseFilter.type = 'bandpass';
      this.pumpNoiseFilter.frequency.value = 140;
      this.pumpNoiseFilter.Q.value = 2.4;

      this.pumpGain = ctx.createGain();
      this.pumpGain.gain.value = 0;

      pumpSource.connect(this.pumpNoiseFilter);
      this.pumpNoiseFilter.connect(this.pumpGain);
      this.pumpGain.connect(this.masterGain);
      pumpSource.start();

      // --- 4. Tire / Dyno Rolling Hum ---
      const roadSource = ctx.createBufferSource();
      roadSource.buffer = noiseBuf;
      roadSource.loop = true;

      this.roadFilter = ctx.createBiquadFilter();
      this.roadFilter.type = 'bandpass';
      this.roadFilter.frequency.value = 160;
      this.roadFilter.Q.value = 0.9;

      this.roadGain = ctx.createGain();
      this.roadGain.gain.value = 0;

      roadSource.connect(this.roadFilter);
      this.roadFilter.connect(this.roadGain);
      this.roadGain.connect(this.masterGain);
      roadSource.start();

      this.initialized = true;
    } catch {
      this.initialized = false;
    }
  }

  public update(state: PowertrainState, timeScale = 1): void {
    if (!this.initialized || !this.ctx) return;

    const now = this.ctx.currentTime;
    if (!this.enabled || document.hidden) {
      this.masterGain.gain.setTargetAtTime(0, now, 0.05);
      return;
    }
    this.masterGain.gain.setTargetAtTime(timeScale < 1 ? 0.22 : 0.32, now, 0.08);

    const absSpeed = Math.abs(state.speedKmh);
    const absIceRpm = Math.abs(state.iceRpm);
    const absMg1Rpm = Math.abs(state.mg1Rpm);
    const absMg2Rpm = Math.abs(state.mg2Rpm);

    // 1. Toyota Pedestrian AVAS Acoustic Spaceship Hum (active 0.8 – 35 km/h when ICE is off)
    let avasVol = 0;
    if (!state.iceFuelActive && absSpeed > 0.6 && absSpeed < 36) {
      const fadeLow = Math.min(1, (absSpeed - 0.6) / 3.5);
      const fadeHigh = Math.min(1, (36 - absSpeed) / 8.0);
      avasVol = 0.055 * fadeLow * fadeHigh;
    }
    const avasBaseFreq = 278 + Math.min(40, absSpeed) * 3.1;
    this.avasOsc1.frequency.setTargetAtTime(avasBaseFreq, now, 0.06);
    this.avasOsc2.frequency.setTargetAtTime(avasBaseFreq * 1.498, now, 0.06);
    this.avasGain.gain.setTargetAtTime(avasVol, now, 0.07);

    // 2A. MG2 Traction & Regenerative Braking Whine
    const mg2ElecKw = Math.abs(state.flows.mg2ToCounterKw);
    const mg2Freq = 155 + Math.min(16500, absMg2Rpm) * 0.088;
    const mg2LoadFactor = Math.min(1, 0.18 + mg2ElecKw / 42);
    const mg2SpeedGate = Math.min(1, absMg2Rpm / 260);
    const isRegen = state.flows.mg2ToCounterKw < -0.5;
    const mg2Vol = mg2SpeedGate * mg2LoadFactor * (isRegen ? 0.095 : 0.068);

    this.mg2Osc.frequency.setTargetAtTime(mg2Freq, now, 0.05);
    this.mg2HarmOsc.frequency.setTargetAtTime(mg2Freq * 2.0, now, 0.05);
    this.mg2Gain.gain.setTargetAtTime(mg2Vol, now, 0.06);

    // 2B. MG1 Generator / Starter Whine
    const mg1ElecKw = Math.abs(state.flows.mg1ToPcuKw) + Math.abs(state.flows.carrierToSunKw) * 0.5;
    const mg1Freq = 190 + Math.min(11000, absMg1Rpm) * 0.092;
    const mg1Vol = Math.min(1, absMg1Rpm / 450) * Math.min(1, 0.12 + mg1ElecKw / 35) * 0.048;
    this.mg1Osc.frequency.setTargetAtTime(mg1Freq, now, 0.05);
    this.mg1Gain.gain.setTargetAtTime(mg1Vol, now, 0.06);

    // 3. 2.0L 4-Cylinder Atkinson ICE (Fueled Combustion vs. Fuel-Cut B-Mode Air Pumping)
    const fireHz = Math.max(20, absIceRpm / 30); // 4-cylinder 4-stroke = 2 firings per rev
    this.iceCombOsc.frequency.setTargetAtTime(fireHz, now, 0.05);
    this.iceSubOsc.frequency.setTargetAtTime(fireHz * 0.5, now, 0.05);

    if (state.iceFuelActive && absIceRpm > 400) {
      const iceLoad = Math.min(1, Math.max(0.15, state.flows.iceToCarrierKw / 75));
      const cutoff = 135 + absIceRpm * 0.085 + iceLoad * 290;
      const combVol = (0.085 + iceLoad * 0.13) * Math.min(1, (absIceRpm - 350) / 500);

      this.iceFilter.frequency.setTargetAtTime(cutoff, now, 0.06);
      this.iceCombGain.gain.setTargetAtTime(combVol, now, 0.06);
      this.pumpGain.gain.setTargetAtTime(0.015 * iceLoad, now, 0.06);
    } else if (!state.iceFuelActive && absIceRpm > 260) {
      // Unfueled ICE spinning (MG1 starter cranking OR B-mode engine braking air pump!)
      const pumpRatio = Math.min(1, absIceRpm / 3200);
      this.iceCombGain.gain.setTargetAtTime(0.028 * pumpRatio, now, 0.06);
      this.iceFilter.frequency.setTargetAtTime(110 + absIceRpm * 0.04, now, 0.06);

      this.pumpNoiseFilter.frequency.setTargetAtTime(95 + absIceRpm * 0.11, now, 0.06);
      this.pumpGain.gain.setTargetAtTime(0.12 * pumpRatio, now, 0.06);
    } else {
      this.iceCombGain.gain.setTargetAtTime(0, now, 0.05);
      this.pumpGain.gain.setTargetAtTime(0, now, 0.05);
    }

    // 4. Tire / Road Roll
    const roadVol = Math.min(0.075, (absSpeed / 125) * 0.075);
    this.roadFilter.frequency.setTargetAtTime(120 + absSpeed * 2.2, now, 0.08);
    this.roadGain.gain.setTargetAtTime(roadVol, now, 0.08);
  }

  public dispose(): void {
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
      this.initialized = false;
    }
  }
}
