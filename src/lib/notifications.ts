/**
 * @file Browser notification helpers
 * @description Centralizes Web Notification permission handling and in-page
 * sound playback for task-file watcher events.
 *
 * 📖 Notifications are intentionally best-effort. The board must keep working
 * when the browser blocks notifications, the user has not interacted with the
 * page enough for audio, or the Web Audio API is unavailable.
 *
 * @functions
 *  → getBrowserNotificationPermission — reads current browser permission state
 *  → requestBrowserNotificationPermission — prompts Chrome-compatible browsers
 *  → emitKandownNotification — sends a browser notification and/or page sound
 *  → playNotificationSound — plays a tiny generated Web Audio cue
 *
 * @exports getBrowserNotificationPermission, requestBrowserNotificationPermission, emitKandownNotification, playNotificationSound
 * @see src/lib/store.ts
 * @see src/components/SettingsPage.tsx
 */

import type { KandownConfig, NotificationSoundId } from './types';

export type BrowserNotificationPermission = NotificationPermission | 'unsupported';

interface KandownNotificationOptions {
  title: string;
  body: string;
  config: KandownConfig;
}

interface ToneStep {
  frequency: number;
  durationMs: number;
  delayMs: number;
  type?: OscillatorType;
}

type AudioWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

const SOUND_PATTERNS: Record<NotificationSoundId, ToneStep[]> = {
  soft: [
    { frequency: 520, durationMs: 90, delayMs: 0, type: 'sine' },
    { frequency: 720, durationMs: 120, delayMs: 95, type: 'sine' },
  ],
  chime: [
    { frequency: 660, durationMs: 120, delayMs: 0, type: 'triangle' },
    { frequency: 880, durationMs: 160, delayMs: 125, type: 'triangle' },
  ],
  ping: [
    { frequency: 920, durationMs: 110, delayMs: 0, type: 'sine' },
  ],
  pop: [
    { frequency: 260, durationMs: 55, delayMs: 0, type: 'square' },
    { frequency: 520, durationMs: 80, delayMs: 60, type: 'square' },
  ],
};

let audioContext: AudioContext | null = null;

export function getBrowserNotificationPermission(): BrowserNotificationPermission {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export async function requestBrowserNotificationPermission(): Promise<BrowserNotificationPermission> {
  if (!('Notification' in window)) return 'unsupported';
  return await Notification.requestPermission();
}

export function emitKandownNotification({ title, body, config }: KandownNotificationOptions): void {
  if (config.notifications.sound) {
    playNotificationSound(config.notifications.soundId);
  }

  if (!config.notifications.browser || getBrowserNotificationPermission() !== 'granted') {
    return;
  }

  try {
    new Notification(title, { body });
  } catch {
    // 📖 Browser notifications are an enhancement; blocked notifications should
    // not break the watcher or interrupt board reloads.
  }
}

export function playNotificationSound(soundId: NotificationSoundId): void {
  const pattern = SOUND_PATTERNS[soundId];
  const AudioCtor = window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
  if (!AudioCtor || pattern.length === 0) return;

  try {
    audioContext ??= new AudioCtor();
    const context = audioContext;
    if (context.state === 'suspended') {
      void context.resume();
    }

    const startAt = context.currentTime + 0.01;
    pattern.forEach(step => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const toneStart = startAt + step.delayMs / 1000;
      const toneEnd = toneStart + step.durationMs / 1000;

      oscillator.type = step.type ?? 'sine';
      oscillator.frequency.setValueAtTime(step.frequency, toneStart);
      gain.gain.setValueAtTime(0.0001, toneStart);
      gain.gain.exponentialRampToValueAtTime(0.08, toneStart + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, toneEnd);

      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(toneStart);
      oscillator.stop(toneEnd + 0.02);
    });
  } catch {
    // 📖 Autoplay policies or missing audio devices can reject sound playback.
    // Keep notification dispatch fire-and-forget.
  }
}
