import { useRef, useState, useCallback, useEffect, type ReactNode } from "react";
import { Play, Pause, Volume2, VolumeX } from "lucide-react";

interface VideoPlayerProps {
  /** Video source URL. */
  src: string;
  /** Additional CSS classes for the outermost container. */
  className?: string;
  /** Overlay content rendered inside the container (badges: pin indicator, version label, model). */
  overlays?: ReactNode;
  /** Prefix for all data-testid attributes. */
  testIdPrefix: string;
  /** aria-label for the video element. */
  ariaLabel?: string;
}

export function VideoPlayer({
  src,
  className,
  overlays,
  testIdPrefix,
  ariaLabel,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isHovering, setIsHovering] = useState(false);
  const [progress, setProgress] = useState(0);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {
        /* autoplay may be blocked */
      });
    } else {
      video.pause();
    }
  }, []);

  const toggleMute = useCallback((e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  }, []);

  // Update progress bar via timeupdate event
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onTimeUpdate = () => {
      if (video.duration > 0) {
        setProgress((video.currentTime / video.duration) * 100);
      }
    };
    video.addEventListener("timeupdate", onTimeUpdate);
    return () => video.removeEventListener("timeupdate", onTimeUpdate);
  }, []);

  const handleProgressClick = useCallback(
    (e: { currentTarget: HTMLDivElement; clientX: number; stopPropagation: () => void }) => {
      e.stopPropagation();
      const video = videoRef.current;
      if (!video || !video.duration) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      video.currentTime = fraction * video.duration;
      setProgress(fraction * 100);
    },
    [],
  );

  const showControls = !isPlaying || isHovering;

  return (
    <div
      className={`relative aspect-video bg-black overflow-hidden ${className ?? ""}`}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      data-testid={`${testIdPrefix}-player`}
    >
      <video
        ref={videoRef}
        src={src}
        muted={isMuted}
        preload="metadata"
        playsInline
        className="w-full h-full object-cover"
        aria-label={ariaLabel}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false);
          setProgress(0);
        }}
      />

      {overlays}

      {/* Play / Pause — centered */}
      <button
        type="button"
        onClick={togglePlay}
        className={`absolute inset-0 m-auto flex items-center justify-center w-10 h-10 rounded-full bg-black/50 text-white transition-opacity hover:bg-black/70 ${
          showControls ? "opacity-100" : "opacity-0"
        }`}
        data-testid={`${testIdPrefix}-play-btn`}
        aria-label={isPlaying ? "Pause video" : "Play video"}
      >
        {isPlaying ? (
          <Pause className="h-5 w-5 fill-current" />
        ) : (
          <Play className="h-5 w-5 fill-current" />
        )}
      </button>

      {/* Bottom bar: progress + volume */}
      <div
        className={`absolute bottom-0 left-0 right-0 flex items-center gap-1.5 px-1.5 pb-1.5 pt-6 bg-gradient-to-t from-black/60 to-transparent transition-opacity ${
          showControls ? "opacity-100" : "opacity-0"
        }`}
      >
        {/* Progress bar */}
        <div
          className="flex-1 h-1 rounded-full bg-white/30 cursor-pointer"
          onClick={handleProgressClick}
          data-testid={`${testIdPrefix}-progress`}
          role="progressbar"
          aria-valuenow={Math.round(progress)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Video progress"
        >
          <div
            className="h-full rounded-full bg-white transition-[width] duration-150"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Volume toggle */}
        <button
          type="button"
          onClick={toggleMute}
          className="shrink-0 flex items-center justify-center rounded-full p-1 text-white hover:bg-white/20 transition-colors"
          data-testid={`${testIdPrefix}-mute-btn`}
          aria-label={isMuted ? "Unmute video" : "Mute video"}
        >
          {isMuted ? (
            <VolumeX className="h-3.5 w-3.5" />
          ) : (
            <Volume2 className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}
