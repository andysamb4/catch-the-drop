// Mirrors the device table in scripts/generate-pwa-assets.mjs — keep both in sync when adding devices.
const SPLASH_SCREENS: Array<[width: number, height: number, dpr: number]> = [
  [1290, 2796, 3],
  [1179, 2556, 3],
  [1170, 2532, 3],
  [1284, 2778, 3],
  [1125, 2436, 3],
  [1242, 2688, 3],
  [828, 1792, 2],
  [750, 1334, 2],
  [2048, 2732, 2],
  [1668, 2388, 2],
  [1640, 2360, 2],
  [1620, 2160, 2],
];

export const appleSplashScreens = SPLASH_SCREENS.map(([width, height, dpr]) => ({
  url: `/splash/apple-splash-${width}x${height}.png`,
  media: `(device-width: ${width / dpr}px) and (device-height: ${height / dpr}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: portrait)`,
}));
