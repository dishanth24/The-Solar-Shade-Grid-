// lib/story.ts -- The 90-second story timeline for The Solar Shade Grid
// BUILD_GUIDE.md section 9 (optimized to 90s for judge presentation)

export interface StoryScene {
  at: number; // in seconds
  sceneNumber: number;
  name: string;
  caption: string;
}

export const STORY_SCENES: StoryScene[] = [
  {
    at: 0,
    sceneNumber: 1,
    name: "Normal",
    caption: "A normal day: generation and load balanced",
  },
  {
    at: 20,
    sceneNumber: 2,
    name: "Heatwave",
    caption: "Heatwave: 46 C. Misting on, cold storage boosted",
  },
  {
    at: 40,
    sceneNumber: 3,
    name: "Blackout",
    caption: "Blackout: battery feeds safety lights and cold storage",
  },
  {
    at: 60,
    sceneNumber: 4,
    name: "Gemini Log",
    caption: "The AI explains the shortfall",
  },
  {
    at: 75,
    sceneNumber: 5,
    name: "Twilio SMS",
    caption: "Alert sent to a phone",
  },
];

export interface StoryCallbacks {
  onSceneChange: (scene: StoryScene) => void;
  onProgress: (percent: number, elapsedSeconds: number) => void;
  onEnd: () => void;
  reset: () => void;
  jumpToHour: (hour: number) => void;
  setHeatwave: (heatwave: boolean) => void;
  setBlackout: (blackout: boolean) => void;
  setSpeed: (speed: number) => void;
  onGeminiScene: () => void;
  dispatchAlert: () => void;
}

export interface StoryTimelineHandle {
  stop: () => void;
}

export function startStoryTimeline(callbacks: StoryCallbacks): StoryTimelineHandle {
  const TOTAL_SECONDS = 90;
  const timeouts: NodeJS.Timeout[] = [];
  let interval: NodeJS.Timeout | null = null;
  const startTime = Date.now();

  // Scene 1 - 0:00 (0s) Normal: reset, hour 9, SOC 70%, grid live, speed 1x
  timeouts.push(
    setTimeout(() => {
      callbacks.reset();
      callbacks.jumpToHour(9);
      callbacks.setHeatwave(false);
      callbacks.setBlackout(false);
      callbacks.setSpeed(1);
      callbacks.onSceneChange(STORY_SCENES[0]);
    }, 0)
  );

  // Scene 2 - 0:20 (20s) Heatwave: heatwave on, jump to 12:00
  timeouts.push(
    setTimeout(() => {
      callbacks.setHeatwave(true);
      callbacks.setBlackout(false);
      callbacks.jumpToHour(12);
      callbacks.onSceneChange(STORY_SCENES[1]);
    }, 20 * 1000)
  );

  // Scene 3 - 0:40 (40s) Blackout: grid off, jump to 18:00
  timeouts.push(
    setTimeout(() => {
      callbacks.setBlackout(true);
      callbacks.jumpToHour(18);
      callbacks.onSceneChange(STORY_SCENES[2]);
    }, 40 * 1000)
  );

  // Scene 4 - 1:00 (60s) Gemini Log: caption only for now, plus call onGeminiScene() hook
  timeouts.push(
    setTimeout(() => {
      callbacks.onGeminiScene();
      callbacks.onSceneChange(STORY_SCENES[3]);
    }, 60 * 1000)
  );

  // Scene 5 - 1:15 (75s) SMS Alert: call dispatchAlert()
  timeouts.push(
    setTimeout(() => {
      callbacks.dispatchAlert();
      callbacks.onSceneChange(STORY_SCENES[4]);
    }, 75 * 1000)
  );

  // End - 1:30 (90s): End summary
  timeouts.push(
    setTimeout(() => {
      callbacks.onProgress(100, TOTAL_SECONDS);
      callbacks.onEnd();
    }, TOTAL_SECONDS * 1000)
  );

  // Progress ticker every 200ms for smooth progress bar and percentages up to 90s
  interval = setInterval(() => {
    const elapsedSec = (Date.now() - startTime) / 1000;
    if (elapsedSec >= TOTAL_SECONDS) {
      if (interval) clearInterval(interval);
      return;
    }
    const percent = Math.min(100, (elapsedSec / TOTAL_SECONDS) * 100);
    callbacks.onProgress(percent, elapsedSec);
  }, 200);

  return {
    stop: () => {
      timeouts.forEach((t) => clearTimeout(t));
      if (interval) clearInterval(interval);
    },
  };
}
