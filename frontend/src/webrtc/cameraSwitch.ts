import type { CameraStreamOptions } from "./cameraManager";

const stopTracks = (tracks: MediaStreamTrack[]): void => {
  for (const track of tracks) {
    try {
      track.stop();
    } catch {
      // ignore
    }
  }
};

const stopStreamTracks = (stream: MediaStream): void => {
  stopTracks(stream.getTracks());
};

type ReplaceVideoTrackDeps = {
  sender: RTCRtpSender;
  currentTrack: MediaStreamTrack | null;
  getCameraStream: (options: CameraStreamOptions) => Promise<MediaStream>;
  options: CameraStreamOptions;
};

export const replaceVideoTrackSafely = async ({
  sender,
  currentTrack,
  getCameraStream,
  options,
}: ReplaceVideoTrackDeps): Promise<MediaStreamTrack> => {
  const stream = await getCameraStream({ ...options, audio: false });
  const nextTrack = stream.getVideoTracks()[0];
  if (!nextTrack) {
    stopStreamTracks(stream);
    throw new Error("video-track-missing");
  }

  try {
    await sender.replaceTrack(nextTrack);
  } catch (e) {
    stopStreamTracks(stream);
    throw e;
  }

  if (currentTrack && currentTrack !== nextTrack) {
    stopTracks([currentTrack]);
  }

  for (const track of stream.getTracks()) {
    if (track !== nextTrack) {
      stopTracks([track]);
    }
  }

  return nextTrack;
};
