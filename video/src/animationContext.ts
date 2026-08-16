// Animation "flashiness" multiplier — set once per composition from
// PackVideoProps/WebsitePromoProps.animationIntensity (see
// pipeline/config/animation.mjs) and read by every entrance/idle-motion/
// burst primitive in components/Motion.tsx, Layers.tsx, and Spark.tsx. A
// context (rather than prop-drilling through every scene) since those
// primitives are reused across every scene file without any of them needing
// to know intensity exists.
import { createContext, useContext } from "react";

export const AnimationIntensityContext = createContext<number>(1);

export function useAnimationIntensity(): number {
  return useContext(AnimationIntensityContext);
}
