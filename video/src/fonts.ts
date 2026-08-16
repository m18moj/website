// Loads the two webfonts every composition uses. Never rely on system
// defaults for hero text (motion-patterns rule). Loaded once, cached by
// Remotion's font loader.
import { loadFont as loadDisplay } from "@remotion/google-fonts/Sora";
import { loadFont as loadBody } from "@remotion/google-fonts/Inter";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

const { fontFamily: displayFamily } = loadDisplay("normal", { weights: ["600", "700", "800"] });
const { fontFamily: bodyFamily } = loadBody("normal", { weights: ["400", "500", "600"] });
const { fontFamily: monoFamily } = loadMono("normal", { weights: ["400", "500"] });

export const fontFamilies = {
  display: displayFamily,
  body: bodyFamily,
  mono: monoFamily,
};
