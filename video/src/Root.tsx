import React from "react";
import { Composition } from "remotion";
import { SocialVertical } from "./compositions/SocialVertical";
import { WebsitePremium } from "./compositions/WebsitePremium";
import type { PackVideoProps, WebsitePromoProps } from "./types";
import { sampleSocialProps, sampleWebsiteProps } from "./sampleProps";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="SocialVertical"
        component={SocialVertical}
        durationInFrames={sampleSocialProps.durationInFrames}
        fps={sampleSocialProps.fps}
        width={sampleSocialProps.width}
        height={sampleSocialProps.height}
        defaultProps={sampleSocialProps}
        calculateMetadata={async ({ props }: { props: PackVideoProps }) => ({
          durationInFrames: props.durationInFrames,
          fps: props.fps,
          width: props.width,
          height: props.height,
        })}
      />
      <Composition
        id="WebsitePremium"
        component={WebsitePremium}
        durationInFrames={sampleWebsiteProps.durationInFrames}
        fps={sampleWebsiteProps.fps}
        width={sampleWebsiteProps.width}
        height={sampleWebsiteProps.height}
        defaultProps={sampleWebsiteProps}
        calculateMetadata={async ({ props }: { props: WebsitePromoProps }) => ({
          durationInFrames: props.durationInFrames,
          fps: props.fps,
          width: props.width,
          height: props.height,
        })}
      />
    </>
  );
};
