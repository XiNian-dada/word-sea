// Single entry point. The scene comes first: the interface modules read
// `window.wordSea` when they start, and fall back gracefully without it.
import './scene/app.js';
import responsive from './ui/responsive.js';
import weather from './ui/weather.js';
import highlight from './ui/highlight.js';
import math from './ui/math.js';
import media from './ui/media.js';
import reading from './ui/reading.js';
import collect from './ui/collect.js';
import navigation from './ui/navigation.js';
import missing from './ui/missing.js';

for (const setup of [responsive, weather, highlight, math, media, reading, collect, navigation, missing]) {
  try { setup(); } catch (error) { console.error(error); }
}
