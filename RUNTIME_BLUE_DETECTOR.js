/**
 * BLUE TINT RUNTIME DETECTOR
 * Copy this entire script and paste into your browser console (F12)
 */

console.clear();
console.log('%c🔍 BLUE TINT DETECTOR STARTING...', 'font-size: 16px; font-weight: bold; color: #f5c84c;');
console.log('');

// Function to extract HSL hue from computed color
function getHue(element) {
  const bg = window.getComputedStyle(element).backgroundColor;
  const match = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return null;

  const r = parseInt(match[1]) / 255;
  const g = parseInt(match[2]) / 255;
  const b = parseInt(match[3]) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }

  return { hue: h, rgb: bg };
}

function hasBlue(color) {
  if (!color) return false;
  return color.hue >= 200 && color.hue <= 240;
}

console.log('%c📊 CHECKING MAIN ELEMENTS...', 'font-weight: bold;');
console.log('');

const checks = [
  { name: 'html', el: document.documentElement },
  { name: 'body', el: document.body },
  { name: '#root', el: document.getElementById('root') },
];

let foundBlue = false;

checks.forEach(({ name, el }) => {
  if (!el) {
    console.log('%c❌ ' + name + ' - NOT FOUND', 'color: #ff4444;');
    return;
  }

  const color = getHue(el);
  const isBlue = hasBlue(color);

  if (isBlue) {
    foundBlue = true;
    console.log('%c🔴 ' + name + ' - BLUE DETECTED! Hue: ' + color.hue + '°', 'color: #ff4444; font-weight: bold;');
    console.log('   ' + color.rgb);
  } else {
    console.log('%c✅ ' + name + ' - PURE (Hue: ' + color.hue + '°)', 'color: #44ff44;');
    console.log('   ' + color.rgb);
  }
});

console.log('');
if (foundBlue) {
  console.log('%c🔴 BLUE DETECTED - Hard refresh needed (Cmd+Shift+R)', 'font-size: 14px; font-weight: bold; color: #ff4444;');
} else {
  console.log('%c✅ PURE BLACK - No blue tint', 'font-size: 14px; font-weight: bold; color: #44ff44;');
}
