import * as THREE from 'three';

export interface ExternalGearOptions {
  teeth: number;
  module: number;
  thickness: number;
  boreRadius?: number;
  lighteningHoleCount?: number;
  lighteningHoleOrbit?: number;
  lighteningHoleRadius?: number;
  bevelSize?: number;
}

function polarToShapeXY(r: number, alpha: number): [number, number] {
  return [-r * Math.sin(alpha), r * Math.cos(alpha)];
}

export function createExternalGearGeometry(opts: ExternalGearOptions): THREE.ExtrudeGeometry {
  const {
    teeth,
    module: mod,
    thickness,
    boreRadius = 0.08,
    lighteningHoleCount = 0,
    lighteningHoleOrbit = 0,
    lighteningHoleRadius = 0,
    bevelSize = Math.min(0.012, mod * 0.35),
  } = opts;

  const pitchRadius = (mod * teeth) / 2;
  const tipRadius = pitchRadius + mod * 0.86;
  const rootRadius = Math.max(boreRadius + 0.02, pitchRadius - mod * 1.08);
  const step = (Math.PI * 2) / teeth;

  const shape = new THREE.Shape();

  for (let i = 0; i < teeth; i++) {
    const center = i * step;
    const aRootLeft = center - step * 0.36;
    const aPitchLeft = center - step * 0.24;
    const aTipLeft = center - step * 0.13;
    const aTipRight = center + step * 0.13;
    const aPitchRight = center + step * 0.24;
    const aRootRight = center + step * 0.36;

    const p0 = polarToShapeXY(rootRadius, aRootLeft);
    const p1 = polarToShapeXY(pitchRadius, aPitchLeft);
    const p2 = polarToShapeXY(tipRadius, aTipLeft);
    const p3 = polarToShapeXY(tipRadius, aTipRight);
    const p4 = polarToShapeXY(pitchRadius, aPitchRight);
    const p5 = polarToShapeXY(rootRadius, aRootRight);

    if (i === 0) {
      shape.moveTo(p0[0], p0[1]);
    } else {
      shape.lineTo(p0[0], p0[1]);
    }
    shape.lineTo(p1[0], p1[1]);
    shape.lineTo(p2[0], p2[1]);
    shape.lineTo(p3[0], p3[1]);
    shape.lineTo(p4[0], p4[1]);
    shape.lineTo(p5[0], p5[1]);
  }
  shape.closePath();

  if (boreRadius > 0.005) {
    const borePath = new THREE.Path();
    const segs = 32;
    for (let s = 0; s <= segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      const [bx, by] = polarToShapeXY(boreRadius, a);
      if (s === 0) borePath.moveTo(bx, by);
      else borePath.lineTo(bx, by);
    }
    shape.holes.push(borePath);
  }

  if (lighteningHoleCount > 0 && lighteningHoleRadius > 0.01 && lighteningHoleOrbit > boreRadius) {
    for (let h = 0; h < lighteningHoleCount; h++) {
      const ha = (h / lighteningHoleCount) * Math.PI * 2;
      const [cx, cy] = polarToShapeXY(lighteningHoleOrbit, ha);
      const hole = new THREE.Path();
      const segs = 20;
      for (let s = 0; s <= segs; s++) {
        const a = (s / segs) * Math.PI * 2;
        const hx = cx - lighteningHoleRadius * Math.sin(a);
        const hy = cy + lighteningHoleRadius * Math.cos(a);
        if (s === 0) hole.moveTo(hx, hy);
        else hole.lineTo(hx, hy);
      }
      shape.holes.push(hole);
    }
  }

  const extrudeDepth = Math.max(0.02, thickness - bevelSize * 2);
  const geo = new THREE.ExtrudeGeometry(shape, {
    steps: 1,
    depth: extrudeDepth,
    bevelEnabled: bevelSize > 0,
    bevelThickness: bevelSize,
    bevelSize,
    bevelSegments: 2,
  });

  geo.rotateY(-Math.PI / 2);
  geo.translate(extrudeDepth / 2, 0, 0);
  geo.computeVertexNormals();
  return geo;
}

export interface InternalRingGearOptions {
  teeth: number;
  module: number;
  outerRadius: number;
  thickness: number;
  bevelSize?: number;
}

export function createInternalRingGearGeometry(opts: InternalRingGearOptions): THREE.ExtrudeGeometry {
  const { teeth, module: mod, outerRadius, thickness, bevelSize = 0.008 } = opts;

  const pitchRadius = (mod * teeth) / 2;
  const innerTipRadius = pitchRadius - mod * 0.84;
  const innerRootRadius = pitchRadius + mod * 1.08;
  const step = (Math.PI * 2) / teeth;

  const shape = new THREE.Shape();
  const outerSegs = 96;
  for (let s = 0; s <= outerSegs; s++) {
    const a = (s / outerSegs) * Math.PI * 2;
    const [ox, oy] = polarToShapeXY(outerRadius, a);
    if (s === 0) shape.moveTo(ox, oy);
    else shape.lineTo(ox, oy);
  }
  shape.closePath();

  const innerHole = new THREE.Path();
  for (let i = 0; i < teeth; i++) {
    const center = i * step;
    const aRootLeft = center - step * 0.36;
    const aPitchLeft = center - step * 0.24;
    const aTipLeft = center - step * 0.13;
    const aTipRight = center + step * 0.13;
    const aPitchRight = center + step * 0.24;
    const aRootRight = center + step * 0.36;

    const p0 = polarToShapeXY(innerRootRadius, aRootLeft);
    const p1 = polarToShapeXY(pitchRadius, aPitchLeft);
    const p2 = polarToShapeXY(innerTipRadius, aTipLeft);
    const p3 = polarToShapeXY(innerTipRadius, aTipRight);
    const p4 = polarToShapeXY(pitchRadius, aPitchRight);
    const p5 = polarToShapeXY(innerRootRadius, aRootRight);

    if (i === 0) {
      innerHole.moveTo(p0[0], p0[1]);
    } else {
      innerHole.lineTo(p0[0], p0[1]);
    }
    innerHole.lineTo(p1[0], p1[1]);
    innerHole.lineTo(p2[0], p2[1]);
    innerHole.lineTo(p3[0], p3[1]);
    innerHole.lineTo(p4[0], p4[1]);
    innerHole.lineTo(p5[0], p5[1]);
  }
  innerHole.closePath();
  shape.holes.push(innerHole);

  const extrudeDepth = Math.max(0.02, thickness - bevelSize * 2);
  const geo = new THREE.ExtrudeGeometry(shape, {
    steps: 1,
    depth: extrudeDepth,
    bevelEnabled: bevelSize > 0,
    bevelThickness: bevelSize,
    bevelSize,
    bevelSegments: 2,
  });

  geo.rotateY(-Math.PI / 2);
  geo.translate(extrudeDepth / 2, 0, 0);
  geo.computeVertexNormals();
  return geo;
}

export function computeExternalMeshAngle(
  y1: number,
  z1: number,
  teeth1: number,
  theta1: number,
  y2: number,
  z2: number,
  teeth2: number
): number {
  const phi12 = Math.atan2(z2 - z1, y2 - y1);
  const phi21 = phi12 + Math.PI;
  return phi21 - Math.PI / teeth2 + (teeth1 / teeth2) * (phi12 - theta1);
}

export interface RotationIndicatorRig {
  group: THREE.Group;
  cwGroup: THREE.Group;
  ccwGroup: THREE.Group;
  stopRing: THREE.Mesh;
}

/**
 * Builds a prominent 3D triple-arc + large conical arrowhead indicator wrapping outside an assembly.
 */
export function createRotationIndicatorRig(
  radius: number,
  colorHex: number,
  tubeScale = 1
): RotationIndicatorRig {
  const group = new THREE.Group();

  const activeMat = new THREE.MeshStandardMaterial({
    color: colorHex,
    emissive: colorHex,
    emissiveIntensity: 0.68,
    roughness: 0.22,
    metalness: 0.28,
  });

  const stopMat = new THREE.MeshStandardMaterial({
    color: colorHex,
    emissive: colorHex,
    emissiveIntensity: 0.16,
    roughness: 0.45,
    metalness: 0.35,
    transparent: true,
    opacity: 0.42,
  });

  const tubeRadius = Math.max(0.024, radius * 0.038) * tubeScale;
  const coneGeo = new THREE.ConeGeometry(tubeRadius * 2.9, tubeRadius * 6.8, 16);
  const arcSpan = Math.PI * 0.42;
  const arcGeo = new THREE.TorusGeometry(radius, tubeRadius, 12, 32, arcSpan);
  arcGeo.rotateY(Math.PI / 2);

  const cwGroup = new THREE.Group();
  const ccwGroup = new THREE.Group();

  // 3 evenly spaced directional arcs (120° apart) so rotation direction is unmistakable from every view angle
  for (let k = 0; k < 3; k++) {
    const baseAngle = (k * Math.PI * 2) / 3;

    const cwBranch = new THREE.Group();
    cwBranch.rotation.x = baseAngle;
    cwBranch.add(new THREE.Mesh(arcGeo, activeMat));

    const cwTip = new THREE.Mesh(coneGeo, activeMat);
    const tipY = radius * Math.sin(arcSpan);
    const tipZ = -radius * Math.cos(arcSpan);
    cwTip.position.set(0, tipY, tipZ);
    cwTip.rotation.x = arcSpan;
    cwBranch.add(cwTip);
    cwGroup.add(cwBranch);

    const ccwBranch = new THREE.Group();
    ccwBranch.rotation.x = baseAngle;
    ccwBranch.add(new THREE.Mesh(arcGeo, activeMat));

    const ccwTip = new THREE.Mesh(coneGeo, activeMat);
    ccwTip.position.set(0, 0, -radius);
    ccwTip.rotation.x = Math.PI;
    ccwBranch.add(ccwTip);
    ccwGroup.add(ccwBranch);
  }

  const stopGeo = new THREE.TorusGeometry(radius, tubeRadius * 0.65, 10, 56);
  stopGeo.rotateY(Math.PI / 2);
  const stopRing = new THREE.Mesh(stopGeo, stopMat);

  group.add(cwGroup);
  group.add(ccwGroup);
  group.add(stopRing);

  return { group, cwGroup, ccwGroup, stopRing };
}
