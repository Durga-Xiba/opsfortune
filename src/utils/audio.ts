/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

class SoundEngine {
  private ctx: AudioContext | null = null;
  public isUnlocked = false;

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    return this.ctx;
  }

  public unlock(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx
        .resume()
        .then(() => {
          this.isUnlocked = true;
        })
        .catch(() => {
          // safe catch
        });
    } else {
      this.isUnlocked = true;
    }
  }

  /**
   * 1. 02:00 CHECKPOINT: LONG + MAX VOLUME START BUZZER
   * Triggered immediately when the Host presses START.
   * Indicates that the 2-minute answer round has started.
   * Duration: ~1.0s, Maximum acoustic volume.
   */
  public play0200StartBuzzer(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    try {
      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const osc3 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sawtooth';
      osc2.type = 'square';
      osc3.type = 'sawtooth';

      // 3-tone bright start klaxon (A4 / C#5 / E5)
      osc1.frequency.setValueAtTime(440, now);
      osc1.frequency.linearRampToValueAtTime(460, now + 0.95);

      osc2.frequency.setValueAtTime(554.37, now);
      osc2.frequency.linearRampToValueAtTime(575, now + 0.95);

      osc3.frequency.setValueAtTime(659.25, now);
      osc3.frequency.linearRampToValueAtTime(690, now + 0.95);

      // Max Volume (0.85 safe ceiling)
      gain.gain.setValueAtTime(0.85, now);
      gain.gain.setValueAtTime(0.85, now + 0.75);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.0);

      osc1.connect(gain);
      osc2.connect(gain);
      osc3.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc3.start(now);
      osc1.stop(now + 1.02);
      osc2.stop(now + 1.02);
      osc3.stop(now + 1.02);
    } catch {
      // safe audio fallback
    }
  }

  /**
   * 2-6. 01:50, 01:40, 01:30, 01:20, 01:10 CHECKPOINTS:
   * Medium + HIGH-VOLUME BUZZER.
   * Sharp, clear, high-penetration alert for hall acoustics.
   * Duration: ~0.38s.
   */
  public playMediumBuzzer(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    try {
      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'square';
      osc2.type = 'sawtooth';

      osc1.frequency.setValueAtTime(880, now);
      osc1.frequency.exponentialRampToValueAtTime(700, now + 0.35);

      osc2.frequency.setValueAtTime(1100, now);
      osc2.frequency.exponentialRampToValueAtTime(850, now + 0.35);

      gain.gain.setValueAtTime(0.75, now);
      gain.gain.setValueAtTime(0.72, now + 0.25);
      gain.gain.exponentialRampToValueAtTime(0.005, now + 0.38);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.39);
      osc2.stop(now + 0.39);
    } catch {
      // safe audio fallback
    }
  }

  /**
   * 7. 01:00 CHECKPOINT: LONG + MAX VOLUME BUZZER
   * Special warning / end-of-answer-time buzzer.
   * Indicates that participants' answer time is OVER.
   * Significantly longer (~1.3s) and louder than the medium buzzers.
   */
  public play0100TimeUpBuzzer(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    try {
      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const osc3 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sawtooth';
      osc2.type = 'square';
      osc3.type = 'sawtooth';

      // Urgent descending alarm horn
      osc1.frequency.setValueAtTime(740, now);
      osc1.frequency.linearRampToValueAtTime(520, now + 1.25);

      osc2.frequency.setValueAtTime(925, now);
      osc2.frequency.linearRampToValueAtTime(650, now + 1.25);

      osc3.frequency.setValueAtTime(1110, now);
      osc3.frequency.linearRampToValueAtTime(780, now + 1.25);

      // Max Volume (0.90 safe ceiling)
      gain.gain.setValueAtTime(0.90, now);
      gain.gain.setValueAtTime(0.90, now + 0.95);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.3);

      osc1.connect(gain);
      osc2.connect(gain);
      osc3.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc3.start(now);
      osc1.stop(now + 1.32);
      osc2.stop(now + 1.32);
      osc3.stop(now + 1.32);
    } catch {
      // safe audio fallback
    }
  }

  /**
   * 8. 00:00 CHECKPOINT: LONG + MAX VOLUME FINAL BUZZER
   * Indicates that the entire question/round is completely over.
   * Heavy-duty deep game-show klaxon chord.
   * Duration: ~1.4s, Max volume.
   */
  public playFinalBuzzer(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    try {
      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const osc3 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sawtooth';
      osc2.type = 'square';
      osc3.type = 'sawtooth';

      // Deep, commanding low blast chord
      osc1.frequency.setValueAtTime(175, now);
      osc1.frequency.linearRampToValueAtTime(130, now + 1.35);

      osc2.frequency.setValueAtTime(225, now);
      osc2.frequency.linearRampToValueAtTime(165, now + 1.35);

      osc3.frequency.setValueAtTime(350, now);
      osc3.frequency.linearRampToValueAtTime(260, now + 1.35);

      // Max Volume (0.90 safe ceiling)
      gain.gain.setValueAtTime(0.90, now);
      gain.gain.setValueAtTime(0.90, now + 1.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.4);

      osc1.connect(gain);
      osc2.connect(gain);
      osc3.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc3.start(now);
      osc1.stop(now + 1.42);
      osc2.stop(now + 1.42);
      osc3.stop(now + 1.42);
    } catch {
      // safe audio fallback
    }
  }

  /**
   * Wrong-guess penalty sound (-10 points)
   */
  public playWrongGuessSound(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.setValueAtTime(110, now + 0.12);

      gain.gain.setValueAtTime(0.45, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.29);
    } catch {
      // safe audio fallback
    }
  }

  /**
   * Reveal chime when an answer is unlocked
   */
  public playRevealChime(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    try {
      const now = ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
      notes.forEach((freq, idx) => {
        const noteTime = now + idx * 0.06;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, noteTime);

        gain.gain.setValueAtTime(0.35, noteTime);
        gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.35);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(noteTime);
        osc.stop(noteTime + 0.36);
      });
    } catch {
      // safe fallback
    }
  }
}

export const soundEngine = new SoundEngine();
