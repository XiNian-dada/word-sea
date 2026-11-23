// Adaptive 3-tier quality policy: protects mobile phones, weak integrated GPUs,
// and software renderers while keeping capable desktops untouched.

export const TIERS = [
  {
    id: 0,
    name: 'low',
    maxPixels: .65e6,
    maxScale: .9,
    minScale: .5,
    frameInterval: 1000 / 30,
    meshRows: 96,
    meshCols: 80,
    cloudQuality: 0,
    oceanDetail: 0,
    particles: 1800,
    atlasSize: 1024,
    lowPower: true,
  },
  {
    id: 1,
    name: 'medium',
    maxPixels: 1.35e6,
    maxScale: 1.25,
    minScale: .55,
    frameInterval: 1000 / 60,
    meshRows: 144,
    meshCols: 116,
    cloudQuality: .5,
    oceanDetail: 1,
    particles: 3600,
    atlasSize: 2048,
    lowPower: false,
  },
  {
    id: 2,
    name: 'high',
    maxPixels: 2.4e6,
    maxScale: 1.5,
    minScale: .55,
    frameInterval: 1000 / 60,
    meshRows: 224,
    meshCols: 176,
    cloudQuality: 1,
    oceanDetail: 1,
    particles: 6000,
    atlasSize: 2048,
    lowPower: false,
  },
];

const SOFTWARE_RE = /swiftshader|llvmpipe|softpipe|software|mesa offscreen|microsoft basic render|warp|lavapipe/i;
const WEAK_GPU_RE = /intel.*(hd graphics [2-6]\d\d|uhd graphics (6\d\d|g1)|iris graphics [56]\d\d|bay trail|braswell|apollo lake|gemini lake|jasper lake)|mali-(4\d\d|t\d\d\d|g3\d|g5\d|g57)|adreno.*(3\d\d|4\d\d|5\d\d|61\d)|powervr|videocore/i;

export function parseQualityOverride(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'high' || normalized === '2') return 2;
  if (normalized === 'medium' || normalized === 'med' || normalized === '1') return 1;
  if (normalized === 'low' || normalized === '0') return 0;
  return null;
}

export function isSoftwareRenderer(rendererString) {
  return Boolean(rendererString && SOFTWARE_RE.test(rendererString));
}

export function isWeakGpu(rendererString) {
  return Boolean(rendererString && WEAK_GPU_RE.test(rendererString));
}

export function shouldUseAntialias({ coarse = false, cores, memory, override = null } = {}) {
  if (override === 0) return false;
  if (override === 2) return true;
  if (coarse) return false;
  if (Number.isFinite(cores) && cores <= 4 && Number.isFinite(memory) && memory <= 4) return false;
  return true;
}

export function detectInitialTier({ coarse = false, width = 1280, height = 800, cores, memory, renderer = '', software = false, override = null } = {}) {
  if (override !== null && TIERS[override]) {
    return { tier: override, maxTier: override, locked: true };
  }
  if (
    software
    || isSoftwareRenderer(renderer)
    || (Number.isFinite(cores) && cores <= 2)
    || (Number.isFinite(memory) && memory <= 2)
  ) {
    return { tier: 0, maxTier: 0, locked: false };
  }
  if (
    coarse
    || Math.min(width, height) < 700
    || isWeakGpu(renderer)
    || (Number.isFinite(cores) && cores <= 4 && Number.isFinite(memory) && memory <= 4)
  ) {
    return { tier: 1, maxTier: 1, locked: false };
  }
  return { tier: 2, maxTier: 2, locked: false };
}

export function atlasSizeFor(tierConfig, { maxTexture = 2048, memory } = {}) {
  const cap = tierConfig.id === 1 && Number.isFinite(memory) && memory <= 4 ? 1024 : tierConfig.atlasSize;
  return Math.min(maxTexture, cap);
}

/**
 * Steps between quality tiers from runtime frame-pacing signals emitted by
 * Governor without creating resolve-climb bounce loops.
 */
export class QualityController {
  constructor({ tier = 2, maxTier = 2, locked = false } = {}) {
    this.tier = tier;
    this.maxTier = maxTier;
    this.locked = locked;
    this.slowStrikes = 0;
    this.calmStreak = 0;
    this.climbsLeft = 1;
  }

  get config() {
    return TIERS[this.tier];
  }

  observe(event) {
    if (this.locked || !event) return false;
    if (event === 'slow-floor') {
      if (this.tier > 0) {
        this.tier--;
        this.slowStrikes = 0;
        this.calmStreak = 0;
        return true;
      }
      this.calmStreak = 0;
      return false;
    }
    if (event === 'slow-low') {
      this.calmStreak = 0;
      if (++this.slowStrikes >= 2 && this.tier > 0) {
        this.tier--;
        this.slowStrikes = 0;
        return true;
      }
      return false;
    }
    if (event === 'calm-max') {
      this.slowStrikes = 0;
      if (this.tier < this.maxTier && this.climbsLeft > 0 && ++this.calmStreak >= 6) {
        this.tier++;
        this.calmStreak = 0;
        this.climbsLeft--;
        return true;
      }
      return false;
    }
    this.calmStreak = 0;
    return false;
  }
}
