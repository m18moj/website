import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("png");
Config.setOverwriteOutput(true);
Config.setCodec("h264");
Config.setCrf(17);
Config.setPixelFormat("yuv420p");
Config.setChromiumOpenGlRenderer("angle");
