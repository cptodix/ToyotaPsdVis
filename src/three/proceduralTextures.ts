import * as THREE from 'three';

/**
 * Procedurally generated zero-dependency textures following strict sRGB / Linear color-space rules.
 */
export function createBrushedMetalRoughnessMap(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#787878';
  ctx.fillRect(0, 0, 512, 512);

  // Fine concentric & linear CNC machining streaks
  const cx = 256;
  const cy = 256;
  for (let r = 8; r < 360; r += 2) {
    const shade = 105 + Math.floor(Math.sin(r * 0.7) * 22 + ((r * 17) % 19) - 9);
    ctx.strokeStyle = `rgb(${shade},${shade},${shade})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace; // Data map stays linear
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createTireTreadTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Base Drive Violet vulcanized rubber (color-coded to Wheel #8b5cf6)
  ctx.fillStyle = '#5b21b6';
  ctx.fillRect(0, 0, 512, 512);

  // Raised center & shoulder violet tread bands
  ctx.fillStyle = '#7c3aed';
  ctx.fillRect(8, 0, 92, 512);
  ctx.fillRect(120, 0, 80, 512);
  ctx.fillRect(220, 0, 72, 512);
  ctx.fillRect(312, 0, 80, 512);
  ctx.fillRect(412, 0, 92, 512);

  // Circumferential drainage channels
  ctx.fillStyle = '#1e1b4b';
  const grooves = [110, 210, 302, 402];
  for (const gx of grooves) {
    ctx.fillRect(gx - 9, 0, 18, 512);
  }

  // Angled siping tread blocks so rotation is unmistakable
  ctx.strokeStyle = '#17133a';
  ctx.lineWidth = 7;
  for (let y = 0; y < 512; y += 32) {
    // Left shoulder blocks
    ctx.beginPath();
    ctx.moveTo(8, y);
    ctx.lineTo(98, y + 14);
    ctx.stroke();

    // Center-left rib
    ctx.beginPath();
    ctx.moveTo(122, y + 8);
    ctx.lineTo(198, y + 20);
    ctx.stroke();

    // Center rib
    ctx.beginPath();
    ctx.moveTo(222, y + 18);
    ctx.lineTo(290, y + 6);
    ctx.stroke();

    // Center-right rib
    ctx.beginPath();
    ctx.moveTo(314, y + 20);
    ctx.lineTo(390, y + 8);
    ctx.stroke();

    // Right shoulder blocks
    ctx.beginPath();
    ctx.moveTo(414, y + 14);
    ctx.lineTo(504, y);
    ctx.stroke();

    // Bright violet highlight on leading edge of rubber blocks
    ctx.strokeStyle = '#a78bfa';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(12, y + 4);
    ctx.lineTo(96, y + 18);
    ctx.moveTo(416, y + 18);
    ctx.lineTo(500, y + 4);
    ctx.stroke();
    ctx.strokeStyle = '#17133a';
    ctx.lineWidth = 7;
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 3);
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createRoadRollerTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#141923';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle asphalt aggregate texture
  for (let i = 0; i < 2400; i++) {
    const x = (i * 73) % 512;
    const y = (i * 139) % 512;
    const v = 24 + (i % 18);
    ctx.fillStyle = `rgb(${v},${v + 4},${v + 10})`;
    ctx.fillRect(x, y, 2, 2);
  }

  // Precision knurled dynamometer stripes & violet center alignment stripe
  ctx.fillStyle = '#1f2937';
  for (let y = 0; y < 512; y += 32) {
    ctx.fillRect(0, y, 512, 5);
  }

  // Dashed lane / speed reference ticks
  ctx.fillStyle = '#8b5cf6';
  for (let y = 0; y < 512; y += 64) {
    ctx.fillRect(246, y + 8, 20, 32);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createStudioGridTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#0b101b';
  ctx.fillRect(0, 0, 512, 512);

  // Minor grid
  ctx.strokeStyle = 'rgba(51, 65, 85, 0.28)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 512; i += 64) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 512);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(512, i);
    ctx.stroke();
  }

  // Major perimeter line
  ctx.strokeStyle = 'rgba(100, 116, 139, 0.42)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, 510, 510);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(18, 18);
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(128, 128, 12, 128, 128, 124);
  grad.addColorStop(0, 'rgba(2, 6, 14, 0.72)');
  grad.addColorStop(0.55, 'rgba(2, 6, 14, 0.32)');
  grad.addColorStop(1, 'rgba(2, 6, 14, 0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
