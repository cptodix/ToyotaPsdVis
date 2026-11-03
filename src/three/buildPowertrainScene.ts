import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { PSD_CONSTANTS } from '../simulation/ths5Engine';
import { COMPONENT_COLORS, PowertrainState, RotationDir } from '../types/hybrid';
import {
  computeExternalMeshAngle,
  createExternalGearGeometry,
  createInternalRingGearGeometry,
  createRotationIndicatorRig,
  RotationIndicatorRig,
} from './gearGeometry';
import {
  createBrushedMetalRoughnessMap,
  createContactShadowTexture,
  createRoadRollerTexture,
  createStudioGridTexture,
  createTireTreadTexture,
} from './proceduralTextures';

export interface PowerStreamPath {
  id:
    | 'iceToCarrier'
    | 'carrierToRing'
    | 'carrierToSun'
    | 'mg1ToPcu'
    | 'pcuToMg2'
    | 'batteryToPcu'
    | 'mg2ToCounter'
    | 'counterToWheel';
  curve: THREE.CatmullRomCurve3;
  mesh: THREE.InstancedMesh;
  material: THREE.MeshStandardMaterial;
  count: number;
  phase: number;
  positiveColor: THREE.Color;
  negativeColor: THREE.Color;
}

export interface PistonAssembly {
  pistonHead: THREE.Group;
  conRod: THREE.Mesh;
  crankAngleOffset: number;
  xPos: number;
}

export interface LabelAnchorRefs {
  ice: THREE.Object3D;
  battery: THREE.Object3D;
  mg1: THREE.Object3D;
  mg2: THREE.Object3D;
  wheel: THREE.Object3D;
}

export interface PowertrainSceneContext {
  scene: THREE.Scene;
  labelAnchors: LabelAnchorRefs;
  updateKinematics: (
    state: PowertrainState,
    dt: number,
    visualSpinScale: number,
    explodeFactor: number,
    showStreams: boolean
  ) => void;
  dispose: () => void;
}

// Pre-allocated scratch helpers (Zero GC in render loop)
const _dummy = new THREE.Object3D();
const _curvePt = new THREE.Vector3();
const _curveTan = new THREE.Vector3();
const _upVec = new THREE.Vector3(0, 1, 0);
const _quat = new THREE.Quaternion();

export function buildPowertrainScene(
  renderer: THREE.WebGLRenderer,
  isSoftwareGl: boolean
): PowertrainSceneContext {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x090d16);
  scene.fog = new THREE.FogExp2(0x090d16, 0.022);

  // Studio PBR Environment Reflections
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const envRT = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envRT.texture;
  pmremGenerator.dispose();

  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const metalRoughMap = createBrushedMetalRoughnessMap(maxAniso);
  const tireTreadTex = createTireTreadTexture(maxAniso);
  const roadTrackTex = createRoadRollerTexture(maxAniso);
  const floorGridTex = createStudioGridTexture(maxAniso);
  const contactShadowTex = createContactShadowTexture();

  // Balanced 3-Point Warm/Cool Studio Lighting
  const hemiLight = new THREE.HemisphereLight(0x93c5fd, 0x1e293b, 0.8);
  hemiLight.position.set(0, 14, 0);
  scene.add(hemiLight);

  const keyLight = new THREE.DirectionalLight(0xfff3e0, 2.2);
  keyLight.position.set(5.5, 11.8, 8.8);
  keyLight.castShadow = !isSoftwareGl;
  keyLight.shadow.mapSize.set(2048, 2048);
  const d = 9.6;
  keyLight.shadow.camera.left = -d;
  keyLight.shadow.camera.right = d;
  keyLight.shadow.camera.top = d;
  keyLight.shadow.camera.bottom = -d;
  keyLight.shadow.camera.near = 1.0;
  keyLight.shadow.camera.far = 30.0;
  keyLight.shadow.bias = -0.0005;
  keyLight.shadow.normalBias = 0.02;
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xbae6fd, 0.95);
  fillLight.position.set(-8.0, 5.5, 6.5);
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0xe0e7ff, 1.15);
  rimLight.position.set(-2.0, 7.2, -9.0);
  scene.add(rimLight);

  if (!isSoftwareGl) {
    RectAreaLightUniformsLib.init();
    const softbox1 = new THREE.RectAreaLight(0xfffbeb, 3.2, 8.5, 2.8);
    softbox1.position.set(0.5, 7.2, 4.8);
    softbox1.lookAt(0.2, 0.8, 0.2);
    scene.add(softbox1);

    const softbox2 = new THREE.RectAreaLight(0x38bdf8, 1.8, 6.5, 2.2);
    softbox2.position.set(-3.5, 5.4, -4.5);
    softbox2.lookAt(-0.5, 0.8, 0);
    scene.add(softbox2);
  }

  // ============================================================================
  // STEPPED VERTICAL MULTI-AXIS COORDINATES (y_ICE_PSD_MG1 > y_MG2 > y_Wheel)
  // Exact gear pitch-circle tangency preserved on every mesh!
  // ============================================================================
  const m1 = 0.030; // PSD module: R_S=0.450 (30T), R_P=0.360 (24T), R_R=1.170 (78T)
  const m2 = 0.032; // Counter train: R_rcd=0.640 (40T), R_cd=0.704 (44T), R_mg2p=0.208 (13T)
  const m3 = 0.032; // Final drive: R_fdp=0.288 (18T), R_fdr=0.832 (52T)

  // Axis 1 (Highest Tier): ICE (-5.45) -> PSD (-1.75) -> Ring Counter Gear (+0.55) -> MG1 (+2.45)
  const y1 = 1.45;
  const z1 = -0.45;

  // Axis 3: Countershaft (+0.55 -> +3.10), exact pitch tangency d13 = 0.640 + 0.704 = 1.344
  const d13 = 0.64 + 0.704;
  const angle13 = -1.12;
  const y3 = y1 + d13 * Math.sin(angle13); // +0.240
  const z3 = z1 + d13 * Math.cos(angle13); // +0.136

  // Axis 2 (Middle Tier — lower than ICE/PSD/MG1, higher than Wheel): MG2 (+4.45, pinion at +1.95)
  const d32 = 0.704 + 0.208;
  const angle32 = 0.62;
  const y2 = y3 + d32 * Math.sin(angle32); // +0.770
  const z2 = z3 + d32 * Math.cos(angle32); // +0.878

  // Axis 4 (Lowest Tier): Differential (+3.10) -> Final Axle -> Wheel (+6.35)
  const d34 = 0.288 + 0.832;
  const angle34 = -0.82;
  const y4 = y3 + d34 * Math.sin(angle34); // -0.579
  const z4 = z3 + d34 * Math.cos(angle34); // +0.900

  const tireOuterRadius = 1.02;
  const groundY = y4 - tireOuterRadius; // -1.599

  // ============================================================================
  // STUDIO FLOOR, PLINTH & DYNAMOMETER ROLLER
  // ============================================================================
  const floorMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(54, 54),
    new THREE.MeshStandardMaterial({
      map: floorGridTex,
      roughness: 0.86,
      metalness: 0.14,
    })
  );
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.y = groundY - 0.18;
  floorMesh.receiveShadow = true;
  scene.add(floorMesh);

  const plinthGroup = new THREE.Group();
  const plinthBase = new THREE.Mesh(
    new THREE.BoxGeometry(15.2, 0.16, 5.4),
    new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.56,
      metalness: 0.44,
    })
  );
  plinthBase.position.set(0.45, groundY - 0.09, 0.4);
  plinthBase.receiveShadow = true;
  plinthGroup.add(plinthBase);

  const shadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(14.4, 4.8),
    new THREE.MeshBasicMaterial({
      map: contactShadowTex,
      transparent: true,
      opacity: 0.58,
      depthWrite: false,
    })
  );
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.set(0.45, groundY + 0.005, 0.4);
  plinthGroup.add(shadowPlane);

  // Dynamometer Roller directly under the Wheel at x = +6.35
  const dynoRadius = 0.36;
  const dynoRollerGeo = new THREE.CylinderGeometry(dynoRadius, dynoRadius, 0.72, 40);
  dynoRollerGeo.rotateZ(Math.PI / 2);
  const dynoRollerMesh = new THREE.Mesh(
    dynoRollerGeo,
    new THREE.MeshStandardMaterial({
      map: roadTrackTex,
      roughness: 0.65,
      metalness: 0.35,
    })
  );
  dynoRollerMesh.position.set(6.35, groundY - dynoRadius + 0.01, z4);
  dynoRollerMesh.receiveShadow = true;
  scene.add(dynoRollerMesh);

  const dynoCradle = new THREE.Mesh(
    new THREE.BoxGeometry(0.95, 0.14, 0.95),
    new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.42, metalness: 0.7 })
  );
  dynoCradle.position.set(6.35, groundY - 0.06, z4);
  plinthGroup.add(dynoCradle);
  scene.add(plinthGroup);

  // ============================================================================
  // STRICT COLOR-CODED PBR MATERIALS
  // - Crimson (#EF4444): ICE + Thin Spoked Carrier + 4 Planet Gears
  // - Solar Amber (#F59E0B): MG1 + Sun Gear + Sun Shaft
  // - Electric Cyan (#06B6D4): MG2 + Ring Gear + All Connected Counter Gears
  // - Drive Violet (#8B5CF6): Strictly Wheel + Final Axle & Differential Ring
  // ============================================================================
  const matIceCrimson = new THREE.MeshStandardMaterial({
    color: COMPONENT_COLORS.ice.threeHex,
    roughness: 0.25,
    metalness: 0.78,
    roughnessMap: metalRoughMap,
  });
  const matPlanetCrimson = new THREE.MeshStandardMaterial({
    color: 0xf87171,
    roughness: 0.22,
    metalness: 0.82,
    roughnessMap: metalRoughMap,
  });
  const matCarrierCrimson = new THREE.MeshStandardMaterial({
    color: 0xdc2626,
    roughness: 0.52,
    metalness: 0.48,
  });

  const matMg1Amber = new THREE.MeshStandardMaterial({
    color: COMPONENT_COLORS.mg1.threeHex,
    roughness: 0.22,
    metalness: 0.84,
    roughnessMap: metalRoughMap,
  });
  const matMg1Hub = new THREE.MeshStandardMaterial({
    color: 0xd97706,
    roughness: 0.42,
    metalness: 0.64,
    roughnessMap: metalRoughMap,
  });

  const matMg2Cyan = new THREE.MeshStandardMaterial({
    color: COMPONENT_COLORS.mg2.threeHex,
    roughness: 0.22,
    metalness: 0.84,
    roughnessMap: metalRoughMap,
  });
  const matCyanSecondary = new THREE.MeshStandardMaterial({
    color: 0x0891b2,
    roughness: 0.42,
    metalness: 0.64,
    roughnessMap: metalRoughMap,
  });

  const matWheelViolet = new THREE.MeshStandardMaterial({
    color: COMPONENT_COLORS.wheel.threeHex,
    roughness: 0.24,
    metalness: 0.82,
    roughnessMap: metalRoughMap,
  });
  const matVioletSecondary = new THREE.MeshStandardMaterial({
    color: 0x7c3aed,
    roughness: 0.52,
    metalness: 0.5,
  });

  const matBattEmerald = new THREE.MeshStandardMaterial({
    color: COMPONENT_COLORS.battery.threeHex,
    roughness: 0.3,
    metalness: 0.68,
  });

  const matHardenedSteel = new THREE.MeshStandardMaterial({
    color: 0xdbe4f0,
    roughness: 0.24,
    metalness: 0.88,
    roughnessMap: metalRoughMap,
  });
  const matCastAluminum = new THREE.MeshStandardMaterial({
    color: 0x64748b,
    roughness: 0.58,
    metalness: 0.62,
  });
  const matDarkIron = new THREE.MeshStandardMaterial({
    color: 0x273244,
    roughness: 0.68,
    metalness: 0.52,
  });
  const matHairpinCopper = new THREE.MeshStandardMaterial({
    color: 0xe07a45,
    roughness: 0.25,
    metalness: 0.92,
  });

  const explodables: Array<{ obj: THREE.Object3D; baseX: number; explodeDeltaX: number }> = [];

  // ============================================================================
  // 1. INTERNAL COMBUSTION ENGINE (ICE — Far Left at x = -5.45, Axis 1)
  // ============================================================================
  const xIce = -5.45;
  const iceAssembly = new THREE.Group();
  iceAssembly.position.set(xIce, y1, z1);
  scene.add(iceAssembly);
  explodables.push({ obj: iceAssembly, baseX: xIce, explodeDeltaX: -1.2 });

  const engineBackWall = new THREE.Mesh(
    new THREE.BoxGeometry(1.75, 1.18, 0.34),
    matCastAluminum
  );
  engineBackWall.position.set(-0.22, 0.42, -0.34);
  engineBackWall.castShadow = true;
  iceAssembly.add(engineBackWall);

  const camCover = new THREE.Mesh(
    new THREE.BoxGeometry(1.78, 0.22, 0.72),
    matIceCrimson
  );
  camCover.position.set(-0.22, 1.12, -0.08);
  camCover.castShadow = true;
  iceAssembly.add(camCover);

  const oilPan = new THREE.Mesh(
    new THREE.BoxGeometry(1.76, 0.26, 0.76),
    matDarkIron
  );
  oilPan.position.set(-0.22, -0.46, -0.04);
  oilPan.castShadow = true;
  iceAssembly.add(oilPan);

  const cylSleeveGeo = new THREE.CylinderGeometry(
    0.165,
    0.165,
    0.68,
    24,
    1,
    true,
    Math.PI * 0.5,
    Math.PI
  );
  const cylPositionsX = [-0.84, -0.43, -0.02, 0.39];
  for (const cx of cylPositionsX) {
    const sleeve = new THREE.Mesh(cylSleeveGeo, matHardenedSteel);
    sleeve.position.set(cx, 0.58, 0);
    iceAssembly.add(sleeve);
  }

  const iceLegHeight = Math.abs(groundY - (y1 - 0.58));
  const iceMountLeg = new THREE.Mesh(
    new THREE.CylinderGeometry(0.085, 0.13, iceLegHeight, 16),
    matDarkIron
  );
  iceMountLeg.position.set(-0.22, -0.58 - iceLegHeight * 0.5, -0.04);
  iceAssembly.add(iceMountLeg);

  const crankGroup = new THREE.Group();
  iceAssembly.add(crankGroup);

  const mainJournal = new THREE.Mesh(
    new THREE.CylinderGeometry(0.075, 0.075, 2.15, 20),
    matIceCrimson
  );
  mainJournal.rotation.z = Math.PI / 2;
  mainJournal.position.set(-0.08, 0, 0);
  crankGroup.add(mainJournal);

  const flywheelMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.45, 0.45, 0.09, 36),
    matDarkIron
  );
  flywheelMesh.rotation.z = Math.PI / 2;
  flywheelMesh.position.set(0.92, 0, 0);
  flywheelMesh.castShadow = true;
  crankGroup.add(flywheelMesh);

  const damperHub = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.3, 0.12, 28),
    matIceCrimson
  );
  damperHub.rotation.z = Math.PI / 2;
  damperHub.position.set(0.95, 0, 0);
  crankGroup.add(damperHub);

  const crankThrow = 0.16;
  const rodLen = 0.52;
  const pistonGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.18, 24);
  const crownRingGeo = new THREE.TorusGeometry(0.151, 0.008, 8, 24);
  crownRingGeo.rotateX(Math.PI / 2);
  const rodGeo = new THREE.BoxGeometry(0.045, rodLen, 0.065);
  const crankOffsets = [0, Math.PI, Math.PI, 0];
  const pistons: PistonAssembly[] = [];

  for (let i = 0; i < 4; i++) {
    const cx = cylPositionsX[i];
    const phase = crankOffsets[i];
    const pinY = crankThrow * Math.cos(phase);
    const pinZ = crankThrow * Math.sin(phase);

    const crankPin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.16, 14),
      matHardenedSteel
    );
    crankPin.rotation.z = Math.PI / 2;
    crankPin.position.set(cx, pinY, pinZ);
    crankGroup.add(crankPin);

    for (const side of [-0.1, 0.1]) {
      const web = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.28, 0.14), matCarrierCrimson);
      web.position.set(cx + side, pinY * 0.35, pinZ * 0.35);
      web.rotation.x = phase;
      crankGroup.add(web);
    }

    const pistonHead = new THREE.Group();
    const pBody = new THREE.Mesh(pistonGeo, matHardenedSteel);
    pBody.castShadow = true;
    pistonHead.add(pBody);
    const pRing = new THREE.Mesh(crownRingGeo, matIceCrimson);
    pRing.position.y = 0.055;
    pistonHead.add(pRing);
    pistonHead.position.set(cx, 0.58, 0);
    iceAssembly.add(pistonHead);

    const conRod = new THREE.Mesh(rodGeo, matCarrierCrimson);
    iceAssembly.add(conRod);

    pistons.push({ pistonHead, conRod, crankAngleOffset: phase, xPos: cx });
  }

  // Prominent ICE Rotation Direction Ring well clear of flywheel
  const iceIndicator = createRotationIndicatorRig(0.76, COMPONENT_COLORS.ice.threeHex, 1.05);
  iceIndicator.group.position.set(1.55, 0, 0);
  iceAssembly.add(iceIndicator.group);

  const iceLabelAnchor = new THREE.Object3D();
  iceLabelAnchor.position.set(-0.15, 1.55, 0);
  iceAssembly.add(iceLabelAnchor);

  // ============================================================================
  // 2. PLANETARY POWER SPLIT DEVICE (PSD — Open Center-Left at x = -1.75)
  // ============================================================================
  const xPsd = -1.75;

  // 2A. THIN 4-SPOKED PLANETARY CARRIER + 4 CRIMSON PLANET GEARS (Same color as ICE!)
  const carrierRoot = new THREE.Group();
  carrierRoot.position.set(xPsd, y1, z1);
  scene.add(carrierRoot);
  explodables.push({ obj: carrierRoot, baseX: xPsd, explodeDeltaX: -0.65 });

  const carrierGroup = new THREE.Group();
  carrierRoot.add(carrierGroup);

  // Long slim Crimson Input Shaft connecting ICE (-4.45) to Carrier (-2.10 -> local -0.35)
  const iceShaftLen = 2.42;
  const carrierInputShaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.082, 0.082, iceShaftLen, 24),
    matIceCrimson
  );
  carrierInputShaft.rotation.z = Math.PI / 2;
  carrierInputShaft.position.set(-0.34 - iceShaftLen / 2, 0, 0);
  carrierInputShaft.castShadow = true;
  carrierGroup.add(carrierInputShaft);

  // Compact central carrier collar at local x = -0.34 (NO solid disc blocking the gears!)
  const carrierCenterCollar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.145, 0.145, 0.08, 24),
    matCarrierCrimson
  );
  carrierCenterCollar.rotation.z = Math.PI / 2;
  carrierCenterCollar.position.set(-0.34, 0, 0);
  carrierGroup.add(carrierCenterCollar);

  const planetOrbit = (m1 * (PSD_CONSTANTS.Z_SUN + PSD_CONSTANTS.Z_PLANET)) / 2; // 0.810
  const planetGearGeo = createExternalGearGeometry({
    teeth: PSD_CONSTANTS.Z_PLANET,
    module: m1,
    thickness: 0.48,
    boreRadius: 0.095,
    lighteningHoleCount: 4,
    lighteningHoleOrbit: 0.2,
    lighteningHoleRadius: 0.038,
    bevelSize: 0.008,
  });

  const pinGeo = new THREE.CylinderGeometry(0.068, 0.068, 0.62, 20);
  pinGeo.rotateZ(Math.PI / 2);

  const planetMeshes: THREE.Mesh[] = [];
  for (let i = 0; i < PSD_CONSTANTS.N_PLANETS; i++) {
    const beta = (i * Math.PI) / 2;
    const py = planetOrbit * Math.cos(beta);
    const pz = planetOrbit * Math.sin(beta);

    // Thin radial spoke arm on the -X side only — leaves Sun & Planet gears 100% visible!
    const spokeArm = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, planetOrbit, 0.055),
      matCarrierCrimson
    );
    spokeArm.position.set(-0.34, py * 0.5, pz * 0.5);
    spokeArm.rotation.x = beta;
    spokeArm.castShadow = true;
    carrierGroup.add(spokeArm);

    // Slim Crimson planet trunnion pin
    const pinMesh = new THREE.Mesh(pinGeo, matCarrierCrimson);
    pinMesh.position.set(-0.04, py, pz);
    carrierGroup.add(pinMesh);

    // Crimson Planet Gear (Same color family as Carrier & ICE Engine!)
    const pMesh = new THREE.Mesh(planetGearGeo, matPlanetCrimson);
    pMesh.position.set(0, py, pz);
    pMesh.castShadow = true;
    pMesh.receiveShadow = true;

    carrierGroup.add(pMesh);
    planetMeshes.push(pMesh);
  }

  // 2B. SUN GEAR + EXPOSED HOLLOW SHAFT (Solar Amber — Connected to MG1 at x = +2.45)
  const sunRoot = new THREE.Group();
  sunRoot.position.set(xPsd, y1, z1);
  scene.add(sunRoot);
  explodables.push({ obj: sunRoot, baseX: xPsd, explodeDeltaX: 0.15 });

  const sunGroup = new THREE.Group();
  sunRoot.add(sunGroup);

  const sunGearGeo = createExternalGearGeometry({
    teeth: PSD_CONSTANTS.Z_SUN,
    module: m1,
    thickness: 0.56,
    boreRadius: 0.12,
    bevelSize: 0.008,
  });
  const sunGearMesh = new THREE.Mesh(sunGearGeo, matMg1Amber);
  sunGearMesh.castShadow = true;
  sunGearMesh.receiveShadow = true;
  sunGroup.add(sunGearMesh);

  // Long exposed Solar Amber Sun Shaft spanning from PSD (-1.75) to MG1 (+2.45 -> length 4.25)
  const sunShaftLen = 4.25;
  const sunHollowShaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.088, 0.088, sunShaftLen, 28),
    matMg1Amber
  );
  sunHollowShaft.rotation.z = Math.PI / 2;
  sunHollowShaft.position.set(sunShaftLen / 2, 0, 0);
  sunHollowShaft.castShadow = true;
  sunGroup.add(sunHollowShaft);

  // 2C. INTERNAL RING GEAR + OPEN WIRE SPOKES TO COUNTER DRIVE GEAR (Electric Cyan — Same as MG2!)
  const ringRoot = new THREE.Group();
  ringRoot.position.set(xPsd, y1, z1);
  scene.add(ringRoot);
  explodables.push({ obj: ringRoot, baseX: xPsd, explodeDeltaX: 0.65 });

  const ringGroup = new THREE.Group();
  ringRoot.add(ringGroup);

  const ringGearGeo = createInternalRingGearGeometry({
    teeth: PSD_CONSTANTS.Z_RING,
    module: m1,
    outerRadius: 1.32,
    thickness: 0.4,
    bevelSize: 0.008,
  });
  const ringGearMesh = new THREE.Mesh(ringGearGeo, matMg2Cyan);
  ringGearMesh.castShadow = true;
  ringGearMesh.receiveShadow = true;
  ringGroup.add(ringGearMesh);

  // Ring Counter Drive Gear sits at world x = +0.55 -> local x = 0.55 - (-1.75) = +2.30!
  const localRingCounterX = 2.3;

  // 3 ultra-thin curved wire spokes connecting Ring Gear (local x=0.18, R=1.24) to Counter Drive Gear (local x=2.30, R=0.52)
  // Leaves huge open space so PSD & Sun Shaft are completely unobstructed!
  for (let b = 0; b < 3; b++) {
    const ba = (b * Math.PI * 2) / 3 + Math.PI / 6;
    const armCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.18, 1.24 * Math.cos(ba), 1.24 * Math.sin(ba)),
      new THREE.Vector3(1.15, 1.16 * Math.cos(ba), 1.16 * Math.sin(ba)),
      new THREE.Vector3(2.05, 0.72 * Math.cos(ba), 0.72 * Math.sin(ba)),
      new THREE.Vector3(localRingCounterX - 0.1, 0.5 * Math.cos(ba), 0.5 * Math.sin(ba)),
    ]);
    const armTube = new THREE.Mesh(
      new THREE.TubeGeometry(armCurve, 24, 0.032, 10, false),
      matCyanSecondary
    );
    ringGroup.add(armTube);
  }

  // Cyan Ring Counter Drive Gear (40T, m2=0.032, R=0.640) at world x = +0.55
  const ringCounterDriveGeo = createExternalGearGeometry({
    teeth: PSD_CONSTANTS.Z_RING_COUNTER_DRIVE,
    module: m2,
    thickness: 0.28,
    boreRadius: 0.24, // Wide center opening around the 0.088 Amber Sun Shaft
    lighteningHoleCount: 6,
    lighteningHoleOrbit: 0.43,
    lighteningHoleRadius: 0.065,
    bevelSize: 0.008,
  });
  const ringCounterDriveMesh = new THREE.Mesh(ringCounterDriveGeo, matMg2Cyan);
  ringCounterDriveMesh.position.set(localRingCounterX, 0, 0);
  ringCounterDriveMesh.castShadow = true;
  ringGroup.add(ringCounterDriveMesh);

  // ============================================================================
  // 3. MG1 — COMPACT SMALL GENERATOR / STARTER (x = +2.45 on Axis 1, Solar Amber)
  //    Visibly smaller than MG2 just like the real Toyota transaxle!
  // ============================================================================
  const xMg1 = 2.45;
  const mg1Root = new THREE.Group();
  mg1Root.position.set(xMg1, y1, z1);
  scene.add(mg1Root);
  explodables.push({ obj: mg1Root, baseX: xMg1, explodeDeltaX: 1.15 });

  // Compact Stator Housing (R_outer = 0.44, length = 0.52)
  const statorShape1 = new THREE.Shape();
  statorShape1.absarc(0, 0, 0.44, -Math.PI * 0.15, Math.PI * 1.15, false);
  statorShape1.absarc(0, 0, 0.34, Math.PI * 1.15, -Math.PI * 0.15, true);
  statorShape1.closePath();
  const mg1StatorGeo = new THREE.ExtrudeGeometry(statorShape1, {
    depth: 0.52,
    bevelEnabled: true,
    bevelSize: 0.01,
    bevelThickness: 0.01,
  });
  mg1StatorGeo.rotateY(-Math.PI / 2);
  mg1StatorGeo.translate(0.26, 0, 0);
  // Painted in MG1 Solar Amber color code!
  const mg1StatorMesh = new THREE.Mesh(mg1StatorGeo, matMg1Hub);
  mg1StatorMesh.castShadow = true;
  mg1Root.add(mg1StatorMesh);

  // MG1 Hairpin Copper Coils (compact)
  const mg1CoilGeo = new THREE.BoxGeometry(0.6, 0.032, 0.045);
  const mg1CoilCount = 18;
  const mg1Coils = new THREE.InstancedMesh(mg1CoilGeo, matHairpinCopper, mg1CoilCount);
  for (let c = 0; c < mg1CoilCount; c++) {
    const a = -Math.PI * 0.12 + (c / (mg1CoilCount - 1)) * Math.PI * 1.24;
    _dummy.position.set(0, 0.325 * Math.cos(a), 0.325 * Math.sin(a));
    _dummy.rotation.set(a, 0, 0);
    _dummy.scale.set(1, 1, 1);
    _dummy.updateMatrix();
    mg1Coils.setMatrixAt(c, _dummy.matrix);
  }
  mg1Coils.instanceMatrix.needsUpdate = true;
  mg1Coils.computeBoundingSphere();
  mg1Root.add(mg1Coils);

  const mg1RotorGroup = new THREE.Group();
  mg1Root.add(mg1RotorGroup);

  const mg1RotorLaminations = new THREE.Mesh(
    new THREE.CylinderGeometry(0.29, 0.29, 0.48, 28),
    matHardenedSteel
  );
  mg1RotorLaminations.rotation.z = Math.PI / 2;
  mg1RotorGroup.add(mg1RotorLaminations);

  for (const sideX of [-0.25, 0.25]) {
    const endPlate = new THREE.Mesh(
      new THREE.CylinderGeometry(0.285, 0.285, 0.035, 28),
      matMg1Amber
    );
    endPlate.rotation.z = Math.PI / 2;
    endPlate.position.x = sideX;
    mg1RotorGroup.add(endPlate);
  }
  for (let slot = 0; slot < 6; slot++) {
    const sa = (slot * Math.PI) / 3;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.51, 0.038, 0.038), matMg1Hub);
    bar.position.set(0, 0.28 * Math.cos(sa), 0.28 * Math.sin(sa));
    bar.rotation.x = sa;
    mg1RotorGroup.add(bar);
  }

  // MG1 3D Rotation Indicator (R = 0.66, well outside 0.44 housing!)
  const mg1Indicator = createRotationIndicatorRig(0.66, COMPONENT_COLORS.mg1.threeHex, 1.05);
  mg1Indicator.group.position.set(0.42, 0, 0);
  mg1Root.add(mg1Indicator.group);

  const mg1LabelAnchor = new THREE.Object3D();
  mg1LabelAnchor.position.set(0.1, 0.92, 0);
  mg1Root.add(mg1LabelAnchor);

  // ============================================================================
  // 4. COUNTERSHAFT & CONNECTED GEARS (Axis 3: All Electric Cyan — Same as Ring & MG2!)
  // ============================================================================
  const xCounterStart = 0.55;
  const counterRoot = new THREE.Group();
  counterRoot.position.set(xCounterStart, y3, z3);
  scene.add(counterRoot);
  explodables.push({ obj: counterRoot, baseX: xCounterStart, explodeDeltaX: 0.65 });

  const counterShaftGroup = new THREE.Group();
  counterRoot.add(counterShaftGroup);

  // Counter Driven Gear #1 (44T, m2=0.032, R=0.704) at world x = +0.55 (meshes with Ring Counter Gear!)
  const counterDrivenGeo = createExternalGearGeometry({
    teeth: PSD_CONSTANTS.Z_COUNTER_DRIVEN,
    module: m2,
    thickness: 0.26,
    boreRadius: 0.11,
    lighteningHoleCount: 6,
    lighteningHoleOrbit: 0.42,
    lighteningHoleRadius: 0.095,
    bevelSize: 0.008,
  });
  const counterRingMeshGear = new THREE.Mesh(counterDrivenGeo, matMg2Cyan);
  counterRingMeshGear.castShadow = true;
  counterShaftGroup.add(counterRingMeshGear);

  // Counter Driven Gear #2 at local x = +1.40 (world x = +1.95, meshes with MG2's 13T Pinion!)
  const counterMg2MeshGear = new THREE.Mesh(counterDrivenGeo, matCyanSecondary);
  counterMg2MeshGear.position.set(1.4, 0, 0);
  counterMg2MeshGear.castShadow = true;
  counterShaftGroup.add(counterMg2MeshGear);

  // Exposed Cyan Countershaft spanning world x = +0.55 -> +3.10 (local 0 -> +2.55)
  const counterAxle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.088, 0.088, 2.75, 24),
    matMg2Cyan
  );
  counterAxle.rotation.z = Math.PI / 2;
  counterAxle.position.set(1.28, 0, 0);
  counterShaftGroup.add(counterAxle);

  // Cyan Final Drive Pinion (18T, m3=0.032, R=0.288) at local x = +2.55 (world x = +3.10)
  const finalPinionGeo = createExternalGearGeometry({
    teeth: PSD_CONSTANTS.Z_FINAL_PINION,
    module: m3,
    thickness: 0.28,
    boreRadius: 0.09,
    bevelSize: 0.008,
  });
  const finalPinionMesh = new THREE.Mesh(finalPinionGeo, matMg2Cyan);
  finalPinionMesh.position.set(2.55, 0, 0);
  finalPinionMesh.castShadow = true;
  counterShaftGroup.add(finalPinionMesh);

  // ============================================================================
  // 5. MG2 — LARGE HIGH-TORQUE TRACTION MOTOR (x = +4.45 on Axis 2, Electric Cyan!)
  //    Substantially larger diameter & stack length than MG1!
  // ============================================================================
  const xMg2 = 4.45;
  const mg2Root = new THREE.Group();
  mg2Root.position.set(xMg2, y2, z2);
  scene.add(mg2Root);
  explodables.push({ obj: mg2Root, baseX: xMg2, explodeDeltaX: 1.45 });

  // Large Cutaway Stator Housing (R_outer = 0.78, length = 1.18 — visibly huge vs MG1!)
  const statorShape2 = new THREE.Shape();
  statorShape2.absarc(0, 0, 0.78, Math.PI * 0.25, Math.PI * 1.65, false);
  statorShape2.absarc(0, 0, 0.61, Math.PI * 1.65, Math.PI * 0.25, true);
  statorShape2.closePath();
  const mg2StatorGeo = new THREE.ExtrudeGeometry(statorShape2, {
    depth: 1.18,
    bevelEnabled: true,
    bevelSize: 0.014,
    bevelThickness: 0.014,
  });
  mg2StatorGeo.rotateY(-Math.PI / 2);
  mg2StatorGeo.translate(0.59, 0, 0);
  // Painted in MG2 Electric Cyan color code!
  const mg2StatorMesh = new THREE.Mesh(mg2StatorGeo, matCyanSecondary);
  mg2StatorMesh.castShadow = true;
  mg2Root.add(mg2StatorMesh);

  // Large MG2 Hairpin Copper Coils
  const mg2CoilGeo = new THREE.BoxGeometry(1.3, 0.048, 0.068);
  const mg2CoilCount = 26;
  const mg2Coils = new THREE.InstancedMesh(mg2CoilGeo, matHairpinCopper, mg2CoilCount);
  for (let c = 0; c < mg2CoilCount; c++) {
    const a = Math.PI * 0.28 + (c / (mg2CoilCount - 1)) * Math.PI * 1.34;
    _dummy.position.set(0, 0.58 * Math.cos(a), 0.58 * Math.sin(a));
    _dummy.rotation.set(a, 0, 0);
    _dummy.scale.set(1, 1, 1);
    _dummy.updateMatrix();
    mg2Coils.setMatrixAt(c, _dummy.matrix);
  }
  mg2Coils.instanceMatrix.needsUpdate = true;
  mg2Coils.computeBoundingSphere();
  mg2Root.add(mg2Coils);

  const mg2RotorGroup = new THREE.Group();
  mg2Root.add(mg2RotorGroup);

  // Long exposed Cyan MG2 Shaft reaching left to world x = +1.95 (local x = 1.95 - 4.45 = -2.50)
  const mg2ShaftLen = 3.25;
  const mg2Shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.09, mg2ShaftLen, 24),
    matMg2Cyan
  );
  mg2Shaft.rotation.z = Math.PI / 2;
  mg2Shaft.position.set(-1.02, 0, 0);
  mg2Shaft.castShadow = true;
  mg2RotorGroup.add(mg2Shaft);

  const mg2RotorCore = new THREE.Mesh(
    new THREE.CylinderGeometry(0.52, 0.52, 1.1, 36),
    matHardenedSteel
  );
  mg2RotorCore.rotation.z = Math.PI / 2;
  mg2RotorGroup.add(mg2RotorCore);

  for (const sideX of [-0.56, 0.56]) {
    const endCap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.51, 0.51, 0.045, 32),
      matMg2Cyan
    );
    endCap.rotation.z = Math.PI / 2;
    endCap.position.x = sideX;
    mg2RotorGroup.add(endCap);
  }
  for (let slot = 0; slot < 8; slot++) {
    const sa = (slot * Math.PI) / 4;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.052, 0.052), matCyanSecondary);
    bar.position.set(0, 0.505 * Math.cos(sa), 0.505 * Math.sin(sa));
    bar.rotation.x = sa;
    mg2RotorGroup.add(bar);
  }

  // Cyan MG2 Reduction Pinion (13T, m2=0.032, R=0.208) at local x = -2.50 (world x = +1.95)
  const mg2PinionGeo = createExternalGearGeometry({
    teeth: PSD_CONSTANTS.Z_MG2_PINION,
    module: m2,
    thickness: 0.28,
    boreRadius: 0.08,
    bevelSize: 0.008,
  });
  const mg2PinionMesh = new THREE.Mesh(mg2PinionGeo, matMg2Cyan);
  mg2PinionMesh.position.set(-2.5, 0, 0);
  mg2PinionMesh.castShadow = true;
  mg2RotorGroup.add(mg2PinionMesh);

  // Large MG2 3D Rotation Indicator (R = 1.02, well outside 0.78 housing!)
  const mg2Indicator = createRotationIndicatorRig(1.02, COMPONENT_COLORS.mg2.threeHex, 1.1);
  mg2Indicator.group.position.set(0.76, 0, 0);
  mg2Root.add(mg2Indicator.group);

  const mg2LabelAnchor = new THREE.Object3D();
  mg2LabelAnchor.position.set(0.05, 1.22, 0);
  mg2Root.add(mg2LabelAnchor);

  // ============================================================================
  // 6. DIFFERENTIAL, FINAL AXLE & DRIVE WHEEL (Strictly Drive Violet #8B5CF6!)
  // ============================================================================
  const xDiff = 3.1;
  const wheelRoot = new THREE.Group();
  wheelRoot.position.set(xDiff, y4, z4);
  scene.add(wheelRoot);
  explodables.push({ obj: wheelRoot, baseX: xDiff, explodeDeltaX: 1.65 });

  const diffWheelGroup = new THREE.Group();
  wheelRoot.add(diffWheelGroup);

  // Differential Final Drive Ring Gear (52T, m3=0.032, R=0.832) at world x = +3.10
  const finalRingGeo = createExternalGearGeometry({
    teeth: PSD_CONSTANTS.Z_FINAL_RING,
    module: m3,
    thickness: 0.28,
    boreRadius: 0.22,
    lighteningHoleCount: 8,
    lighteningHoleOrbit: 0.51,
    lighteningHoleRadius: 0.095,
    bevelSize: 0.009,
  });
  const finalRingMesh = new THREE.Mesh(finalRingGeo, matWheelViolet);
  finalRingMesh.castShadow = true;
  diffWheelGroup.add(finalRingMesh);

  const diffCage = new THREE.Mesh(new THREE.SphereGeometry(0.27, 24, 18), matVioletSecondary);
  diffCage.scale.set(1.15, 0.9, 0.9);
  diffWheelGroup.add(diffCage);

  // Long exposed Drive Violet Final Axle spanning world x = +3.10 -> +6.35 (local 0 -> +3.25)
  const localWheelX = 3.25;
  const rightDriveAxle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.088, 0.088, localWheelX + 0.35, 24),
    matWheelViolet
  );
  rightDriveAxle.rotation.z = Math.PI / 2;
  rightDriveAxle.position.set(localWheelX / 2 - 0.1, 0, 0);
  rightDriveAxle.castShadow = true;
  diffWheelGroup.add(rightDriveAxle);

  for (const bootX of [0.42, localWheelX - 0.42]) {
    const cvBoot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.11, 0.22, 20),
      matDarkIron
    );
    cvBoot.rotation.z = Math.PI / 2;
    cvBoot.position.set(bootX, 0, 0);
    diffWheelGroup.add(cvBoot);
  }

  const brakeDiscMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    roughness: 0.32,
    metalness: 0.88,
    roughnessMap: metalRoughMap,
    emissive: 0xff3b00,
    emissiveIntensity: 0,
  });
  const brakeDisc = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.55, 0.06, 36),
    brakeDiscMat
  );
  brakeDisc.rotation.z = Math.PI / 2;
  brakeDisc.position.set(localWheelX - 0.14, 0, 0);
  diffWheelGroup.add(brakeDisc);

  const caliperBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.34, 0.24),
    new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.4, metalness: 0.7 })
  );
  caliperBody.position.set(localWheelX - 0.14, 0.36, -0.36);
  caliperBody.rotation.x = -0.65;
  wheelRoot.add(caliperBody);

  // Drive Wheel at local x = +3.25 (world x = +6.35)
  const wheelAssembly = new THREE.Group();
  wheelAssembly.position.set(localWheelX, 0, 0);
  diffWheelGroup.add(wheelAssembly);

  const rimR = 0.66;
  const tireW = 0.44;
  const tirePoints = [
    new THREE.Vector2(rimR, -tireW * 0.44),
    new THREE.Vector2(rimR + 0.15, -tireW * 0.5),
    new THREE.Vector2(tireOuterRadius - 0.04, -tireW * 0.46),
    new THREE.Vector2(tireOuterRadius, -tireW * 0.34),
    new THREE.Vector2(tireOuterRadius, tireW * 0.34),
    new THREE.Vector2(tireOuterRadius - 0.04, tireW * 0.46),
    new THREE.Vector2(rimR + 0.15, tireW * 0.5),
    new THREE.Vector2(rimR, tireW * 0.44),
  ];
  const tireLatheGeo = new THREE.LatheGeometry(tirePoints, 48);
  tireLatheGeo.rotateZ(Math.PI / 2);
  // Tire painted in Wheel Drive Violet color code (#8b5cf6) with high-contrast tread grooves
  const tireMesh = new THREE.Mesh(
    tireLatheGeo,
    new THREE.MeshStandardMaterial({
      map: tireTreadTex,
      color: 0xf5f3ff,
      roughness: 0.72,
      metalness: 0.12,
    })
  );
  tireMesh.castShadow = true;
  tireMesh.receiveShadow = true;
  wheelAssembly.add(tireMesh);

  const alloyRimBarrel = new THREE.Mesh(
    new THREE.CylinderGeometry(rimR, rimR, tireW * 0.86, 40, 1, true),
    matHardenedSteel
  );
  alloyRimBarrel.rotation.z = Math.PI / 2;
  wheelAssembly.add(alloyRimBarrel);

  for (let sp = 0; sp < 5; sp++) {
    const sa = (sp * Math.PI * 2) / 5;
    const spokeGroup = new THREE.Group();
    spokeGroup.rotation.x = sa;

    const mainSpoke = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.54, 0.09), matWheelViolet);
    mainSpoke.position.set(0.13, 0.35, 0.02);
    spokeGroup.add(mainSpoke);

    const aeroBlade = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.5, 0.06), matHardenedSteel);
    aeroBlade.position.set(0.14, 0.35, -0.055);
    aeroBlade.rotation.x = -0.12;
    spokeGroup.add(aeroBlade);

    wheelAssembly.add(spokeGroup);
  }

  const centerHub = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.18, 0.14, 24),
    matWheelViolet
  );
  centerHub.rotation.z = Math.PI / 2;
  centerHub.position.x = 0.13;
  wheelAssembly.add(centerHub);

  // GIANT OVERSIZED WHEEL ROTATION DIRECTION RING (R = 1.42 > Tire 1.02 — NEVER covered by wheel!)
  const wheelIndicator = createRotationIndicatorRig(1.42, COMPONENT_COLORS.wheel.threeHex, 1.22);
  wheelIndicator.group.position.set(localWheelX + 0.08, 0, 0);
  wheelRoot.add(wheelIndicator.group);

  const wheelLabelAnchor = new THREE.Object3D();
  wheelLabelAnchor.position.set(localWheelX, 1.62, 0);
  wheelRoot.add(wheelLabelAnchor);

  // ============================================================================
  // 7. ELEVATED HV BATTERY & PCU CONTROL UNIT
  //    Positioned prominently ABOVE between Engine (ICE) and Planetary Gear (PSD)
  // ============================================================================
  const hvSystemGroup = new THREE.Group();
  scene.add(hvSystemGroup);

  const hvDeckY = y1 + 1.52; // +2.97 (Clearly above ICE & Planetary Gear!)
  const battPos = new THREE.Vector3(-4.02, hvDeckY, z1);
  const pcuPos = new THREE.Vector3(-2.68, hvDeckY, z1);

  // Slim structural rear gantry tray & support column (behind shaft so 0% occlusion)
  const hvTrayDeck = new THREE.Mesh(
    new THREE.BoxGeometry(2.65, 0.07, 0.84),
    matDarkIron
  );
  hvTrayDeck.position.set(-3.38, hvDeckY - 0.23, z1);
  hvTrayDeck.castShadow = true;
  hvSystemGroup.add(hvTrayDeck);

  const gantryHeight = hvDeckY - 0.25 - groundY;
  const hvSupportPost = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.075, gantryHeight, 16),
    matDarkIron
  );
  hvSupportPost.position.set(-3.38, groundY + gantryHeight * 0.5, z1 - 0.36);
  hvSystemGroup.add(hvSupportPost);

  // Li-Ion HV Battery Pack (Emerald #10b981 color-coded)
  const battCase = new THREE.Mesh(
    new THREE.BoxGeometry(1.48, 0.34, 0.74),
    new THREE.MeshStandardMaterial({ color: 0x064e3b, roughness: 0.42, metalness: 0.62 })
  );
  battCase.position.copy(battPos);
  battCase.castShadow = true;
  hvSystemGroup.add(battCase);

  for (let m = 0; m < 6; m++) {
    const cellMod = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.14, 0.62), matBattEmerald);
    cellMod.position.set(battPos.x - 0.55 + m * 0.22, battPos.y + 0.18, battPos.z);
    cellMod.castShadow = true;
    hvSystemGroup.add(cellMod);
  }

  // PCU Power Control Unit / Inverter right beside HV Battery
  const pcuBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.88, 0.38, 0.7),
    matCastAluminum
  );
  pcuBody.position.copy(pcuPos);
  pcuBody.castShadow = true;
  hvSystemGroup.add(pcuBody);

  // PCU Emerald top cover accent & cooling fins
  const pcuCap = new THREE.Mesh(
    new THREE.BoxGeometry(0.82, 0.05, 0.62),
    matBattEmerald
  );
  pcuCap.position.set(pcuPos.x, pcuPos.y + 0.21, pcuPos.z);
  hvSystemGroup.add(pcuCap);

  const batteryLabelAnchor = new THREE.Object3D();
  batteryLabelAnchor.position.set(-3.38, hvDeckY + 0.56, z1);
  hvSystemGroup.add(batteryLabelAnchor);

  const hvCableMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.45,
    metalness: 0.5,
  });

  // High-Voltage 3D Conduits from Elevated PCU to Battery, MG1, and MG2
  const curveBattToPcu = new THREE.CatmullRomCurve3([
    new THREE.Vector3(battPos.x + 0.72, battPos.y + 0.08, battPos.z + 0.18),
    new THREE.Vector3(-3.26, hvDeckY + 0.12, z1 + 0.22),
    new THREE.Vector3(pcuPos.x - 0.42, pcuPos.y + 0.08, pcuPos.z + 0.18),
  ]);
  const curveMg1ToPcu = new THREE.CatmullRomCurve3([
    new THREE.Vector3(xMg1, y1 + 0.42, z1),
    new THREE.Vector3(0.65, y1 + 1.68, z1 - 0.08),
    new THREE.Vector3(-1.35, hvDeckY + 0.22, z1 - 0.08),
    new THREE.Vector3(pcuPos.x + 0.42, pcuPos.y + 0.08, pcuPos.z - 0.12),
  ]);
  const curvePcuToMg2 = new THREE.CatmullRomCurve3([
    new THREE.Vector3(pcuPos.x + 0.42, pcuPos.y + 0.02, pcuPos.z + 0.18),
    new THREE.Vector3(-0.85, hvDeckY + 0.08, z1 + 0.35),
    new THREE.Vector3(2.25, y2 + 1.55, z2 * 0.45),
    new THREE.Vector3(xMg2 - 0.15, y2 + 0.76, z2),
  ]);

  for (const c of [curveBattToPcu, curveMg1ToPcu, curvePcuToMg2]) {
    hvSystemGroup.add(new THREE.Mesh(new THREE.TubeGeometry(c, 32, 0.028, 10, false), hvCableMat));
  }

  // ============================================================================
  // 8. 3D REAL-TIME POWER FLOW PARTICLE STREAMS
  // ============================================================================
  const powerStreamGroup = new THREE.Group();
  scene.add(powerStreamGroup);

  const pulseGeo = new THREE.CapsuleGeometry(0.048, 0.11, 6, 10);

  function makeStream(
    id: PowerStreamPath['id'],
    points: THREE.Vector3[],
    posHex: number,
    negHex: number,
    count = 9
  ): PowerStreamPath {
    const curve = new THREE.CatmullRomCurve3(points);
    const material = new THREE.MeshStandardMaterial({
      color: posHex,
      emissive: posHex,
      emissiveIntensity: 1.15,
      roughness: 0.2,
      metalness: 0.2,
    });
    const mesh = new THREE.InstancedMesh(pulseGeo, material, count);
    mesh.frustumCulled = false;
    powerStreamGroup.add(mesh);

    return {
      id,
      curve,
      mesh,
      material,
      count,
      phase: 0,
      positiveColor: new THREE.Color(posHex),
      negativeColor: new THREE.Color(negHex),
    };
  }

  const streams: PowerStreamPath[] = [
    makeStream(
      'iceToCarrier',
      [
        new THREE.Vector3(xIce + 0.9, y1 + 0.16, z1 + 0.16),
        new THREE.Vector3(-3.6, y1 + 0.16, z1 + 0.16),
        new THREE.Vector3(xPsd - 0.35, y1 + 0.22, z1 + 0.18),
      ],
      COMPONENT_COLORS.ice.threeHex,
      COMPONENT_COLORS.mg1.threeHex,
      10
    ),
    makeStream(
      'carrierToRing',
      [
        new THREE.Vector3(xPsd + 0.15, y1 + 0.85, z1 + 0.55),
        new THREE.Vector3(-0.55, y1 + 0.55, z1 + 0.45),
        new THREE.Vector3(0.55, y3 + 0.48, z3 - 0.05),
      ],
      COMPONENT_COLORS.mg2.threeHex,
      COMPONENT_COLORS.mg2.threeHex,
      9
    ),
    makeStream(
      'carrierToSun',
      [
        new THREE.Vector3(xPsd + 0.2, y1 + 0.16, z1 + 0.16),
        new THREE.Vector3(0.45, y1 + 0.16, z1 + 0.16),
        new THREE.Vector3(xMg1 - 0.25, y1 + 0.16, z1 + 0.16),
      ],
      COMPONENT_COLORS.mg1.threeHex,
      COMPONENT_COLORS.mg1.threeHex,
      11
    ),
    makeStream(
      'mg1ToPcu',
      curveMg1ToPcu.getPoints(9),
      COMPONENT_COLORS.mg1.threeHex,
      COMPONENT_COLORS.battery.threeHex,
      10
    ),
    makeStream(
      'pcuToMg2',
      curvePcuToMg2.getPoints(9),
      COMPONENT_COLORS.mg2.threeHex,
      COMPONENT_COLORS.battery.threeHex,
      11
    ),
    makeStream(
      'batteryToPcu',
      curveBattToPcu.getPoints(6),
      COMPONENT_COLORS.battery.threeHex,
      COMPONENT_COLORS.battery.threeHex,
      6
    ),
    makeStream(
      'mg2ToCounter',
      [
        new THREE.Vector3(xMg2 - 0.5, y2 - 0.14, z2 - 0.12),
        new THREE.Vector3(3.15, y2 - 0.16, z2 - 0.14),
        new THREE.Vector3(1.95, y3 + 0.35, z3 + 0.22),
      ],
      COMPONENT_COLORS.mg2.threeHex,
      COMPONENT_COLORS.battery.threeHex,
      9
    ),
    makeStream(
      'counterToWheel',
      [
        new THREE.Vector3(0.75, y3 - 0.14, z3 + 0.2),
        new THREE.Vector3(xDiff, y4 + 0.2, z4 + 0.12),
        new THREE.Vector3(4.75, y4 + 0.2, z4 + 0.12),
        new THREE.Vector3(6.15, y4 + 0.2, z4 + 0.12),
      ],
      COMPONENT_COLORS.wheel.threeHex,
      COMPONENT_COLORS.mg2.threeHex,
      12
    ),
  ];

  // ============================================================================
  // KINEMATIC & VISUAL UPDATE LOOP
  // ============================================================================
  const BASE_RPM_TO_RAD_S = 0.00175;
  let thetaIce = 0;
  let thetaSun = 0;
  let thetaRing = 0;
  let smoothedExplode = 0;

  function updateIndicator(rig: RotationIndicatorRig, rpm: number, dt: number) {
    const dir =
      rpm > 10 ? RotationDir.CW : rpm < -10 ? RotationDir.CCW : RotationDir.STOP;
    rig.cwGroup.visible = dir === RotationDir.CW;
    rig.ccwGroup.visible = dir === RotationDir.CCW;
    rig.stopRing.visible = dir === RotationDir.STOP;

    if (dir !== RotationDir.STOP) {
      const sign = dir === RotationDir.CW ? 1 : -1;
      const clampedMag = Math.min(3.6, Math.max(0.5, Math.abs(rpm) * 0.0009));
      rig.group.rotation.x += sign * clampedMag * dt;
    }
  }

  function updateKinematics(
    state: PowertrainState,
    dt: number,
    visualSpinScale: number,
    explodeFactor: number,
    showStreams: boolean
  ) {
    const k = BASE_RPM_TO_RAD_S * visualSpinScale;

    thetaIce += state.iceRpm * k * dt;
    thetaSun += state.mg1Rpm * k * dt;
    thetaRing =
      (PSD_CONSTANTS.Z_SUN + PSD_CONSTANTS.Z_RING) * (thetaIce / PSD_CONSTANTS.Z_RING) -
      (PSD_CONSTANTS.Z_SUN / PSD_CONSTANTS.Z_RING) * thetaSun;

    // 1. ICE Crankshaft & Pistons
    crankGroup.rotation.x = thetaIce;
    for (let i = 0; i < pistons.length; i++) {
      const p = pistons[i];
      const ang = thetaIce + p.crankAngleOffset;
      const pinY = crankThrow * Math.cos(ang);
      const pinZ = crankThrow * Math.sin(ang);
      const headY = pinY + Math.sqrt(Math.max(0.01, rodLen * rodLen - pinZ * pinZ));
      p.pistonHead.position.set(p.xPos, headY, 0);
      p.conRod.position.set(p.xPos, (pinY + headY) * 0.5, pinZ * 0.5);
      p.conRod.rotation.x = Math.atan2(-pinZ, headY - pinY);
    }

    // 2. Thin Spoked Planetary Carrier & 4 Crimson Planet Gears
    carrierGroup.rotation.x = thetaIce;
    const relSunCarrier = thetaSun - thetaIce;
    const sunToPlanetRatio = PSD_CONSTANTS.Z_SUN / PSD_CONSTANTS.Z_PLANET;
    for (let i = 0; i < planetMeshes.length; i++) {
      const beta = (i * Math.PI) / 2;
      planetMeshes[i].rotation.x =
        Math.PI / PSD_CONSTANTS.Z_PLANET -
        beta * sunToPlanetRatio -
        relSunCarrier * sunToPlanetRatio;
    }

    // 3. Sun Gear + MG1 Rotor
    sunGroup.rotation.x = thetaSun;
    mg1RotorGroup.rotation.x = thetaSun;

    // 4. Cyan Ring Gear + Countershaft + MG2 Pinion + Violet Differential & Wheel
    ringGroup.rotation.x = thetaRing;

    const thetaCounter = computeExternalMeshAngle(
      y1,
      z1,
      PSD_CONSTANTS.Z_RING_COUNTER_DRIVE,
      thetaRing,
      y3,
      z3,
      PSD_CONSTANTS.Z_COUNTER_DRIVEN
    );
    counterShaftGroup.rotation.x = thetaCounter;

    const thetaMg2 = computeExternalMeshAngle(
      y3,
      z3,
      PSD_CONSTANTS.Z_COUNTER_DRIVEN,
      thetaCounter,
      y2,
      z2,
      PSD_CONSTANTS.Z_MG2_PINION
    );
    mg2RotorGroup.rotation.x = thetaMg2;

    const thetaWheel = computeExternalMeshAngle(
      y3,
      z3,
      PSD_CONSTANTS.Z_FINAL_PINION,
      thetaCounter,
      y4,
      z4,
      PSD_CONSTANTS.Z_FINAL_RING
    );
    diffWheelGroup.rotation.x = thetaWheel;

    // 5. Dynamometer Roller & Brake Glow
    dynoRollerMesh.rotation.x = -thetaWheel * (tireOuterRadius / dynoRadius);
    const brakeGlowTarget = Math.min(0.85, state.flows.frictionBrakeKw * 0.035);
    brakeDiscMat.emissiveIntensity = THREE.MathUtils.damp(
      brakeDiscMat.emissiveIntensity,
      brakeGlowTarget,
      6,
      dt
    );

    // 6. Smooth Exploded View
    smoothedExplode = THREE.MathUtils.damp(smoothedExplode, explodeFactor, 7.5, dt);
    for (const item of explodables) {
      item.obj.position.x = item.baseX + item.explodeDeltaX * smoothedExplode;
    }

    powerStreamGroup.visible = showStreams;

    // 7. 3D Rotation Direction Rings
    updateIndicator(iceIndicator, state.iceRpm, dt);
    updateIndicator(mg1Indicator, state.mg1Rpm, dt);
    updateIndicator(mg2Indicator, state.mg2Rpm, dt);
    updateIndicator(wheelIndicator, state.wheelRpm, dt);

    // 8. 3D Power Flow Pulses
    if (showStreams) {
      const flowLookup: Record<PowerStreamPath['id'], number> = {
        iceToCarrier: state.flows.iceToCarrierKw,
        carrierToRing: state.flows.carrierToRingKw,
        carrierToSun: state.flows.carrierToSunKw,
        mg1ToPcu: state.flows.mg1ToPcuKw,
        pcuToMg2: state.flows.pcuToMg2Kw,
        batteryToPcu: state.flows.batteryToPcuKw,
        mg2ToCounter: state.flows.mg2ToCounterKw,
        counterToWheel: state.flows.counterToWheelKw,
      };

      for (const s of streams) {
        const kw = flowLookup[s.id];
        const absKw = Math.abs(kw);
        if (absKw < 0.35) {
          s.mesh.visible = false;
          continue;
        }
        s.mesh.visible = true;

        const dirSign = kw >= 0 ? 1 : -1;
        const speed = dirSign * Math.min(1.5, 0.24 + absKw * 0.016);
        s.phase = (((s.phase + speed * dt) % 1) + 1) % 1;

        const targetColor = kw >= 0 ? s.positiveColor : s.negativeColor;
        s.material.color.copy(targetColor);
        s.material.emissive.copy(targetColor);
        s.material.emissiveIntensity = Math.min(1.8, 0.72 + absKw * 0.02);

        const scaleMag = Math.min(1.3, 0.75 + absKw * 0.01);
        for (let idx = 0; idx < s.count; idx++) {
          const u = (s.phase + idx / s.count) % 1;
          s.curve.getPointAt(u, _curvePt);
          s.curve.getTangentAt(u, _curveTan);
          if (dirSign < 0) _curveTan.negate();
          _quat.setFromUnitVectors(_upVec, _curveTan);

          _dummy.position.copy(_curvePt);
          _dummy.quaternion.copy(_quat);
          _dummy.scale.setScalar(scaleMag);
          _dummy.updateMatrix();
          s.mesh.setMatrixAt(idx, _dummy.matrix);
        }
        s.mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }

  function dispose() {
    scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => m.dispose());
        } else {
          mesh.material?.dispose();
        }
      }
    });
    envRT.dispose();
    metalRoughMap.dispose();
    tireTreadTex.dispose();
    roadTrackTex.dispose();
    floorGridTex.dispose();
    contactShadowTex.dispose();
  }

  return {
    scene,
    labelAnchors: {
      ice: iceLabelAnchor,
      battery: batteryLabelAnchor,
      mg1: mg1LabelAnchor,
      mg2: mg2LabelAnchor,
      wheel: wheelLabelAnchor,
    },
    updateKinematics,
    dispose,
  };
}
