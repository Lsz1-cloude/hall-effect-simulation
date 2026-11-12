import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BGM_URL } from './constants';

/** 背景音乐播放/暂停控件（浏览器自动播放受限时静默降级为手动开启） */
export default function AudioToggle() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !BGM_URL) return;
    audio.volume = 0.35;
    audio
      .play()
      .then(() => setPlaying(true))
      .catch(() => setPlaying(false));
    return () => {
      audio.pause();
    };
  }, []);

  if (!BGM_URL) return null;

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio
        .play()
        .then(() => setPlaying(true))
        .catch(() => setPlaying(false));
    }
  };

  return (
    <div className="flex items-center gap-2">
      <span className="tech-label hidden text-xs text-muted-foreground md:inline">BGM</span>
      <Button
        variant="ghost"
        size="icon"
        onClick={toggle}
        aria-label={playing ? '暂停背景音乐' : '播放背景音乐'}
      >
        {playing ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
      </Button>
      {/* iOS Safari 要求 playsInline 才允许音频在页面内播放 */}
      <audio ref={audioRef} src={BGM_URL} loop preload="auto" playsInline className="hidden" />
    </div>
  );
}
