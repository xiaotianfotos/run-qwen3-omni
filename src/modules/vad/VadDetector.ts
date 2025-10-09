export interface VadConfig {
  threshold: number;       // 音量阈值 (0 - 100)
  silenceDuration: number; // 静音持续时间 (毫秒)
  voiceStartCallback?: () => void;
  voiceStopCallback?: () => void;
}

export interface VadState {
  isSpeechDetected: boolean;
  lastSpeechTime: number;
  volume: number;
}

export class VadDetector {
  private config: VadConfig;
  private state: VadState;
  private analyser: AnalyserNode | null = null;
  private animationFrameId: number | null = null;
  private audioContext: AudioContext | null = null;

  constructor(config: VadConfig) {
    this.config = {
      threshold: config.threshold ?? 5,
      silenceDuration: config.silenceDuration ?? 800,
      voiceStartCallback: config.voiceStartCallback,
      voiceStopCallback: config.voiceStopCallback
    };
    this.state = {
      isSpeechDetected: false,
      lastSpeechTime: 0,
      volume: 0
    };
  }

  initialize(audioContext: AudioContext, analyser: AnalyserNode): void {
    this.audioContext = audioContext;
    this.analyser = analyser;
  }

  startDetection(): void {
    if (this.animationFrameId) {
      return; // Already running
    }

    const detect = () => {
      if (!this.analyser) {
        return;
      }

      const volume = this.getVolumeLevel();
      this.state.volume = volume;

      const currentTime = Date.now();
      const isAboveThreshold = volume > this.config.threshold;

      if (isAboveThreshold) {
        // 语音活动检测到
        if (!this.state.isSpeechDetected) {
          this.state.isSpeechDetected = true;
          this.state.lastSpeechTime = currentTime;
          this.config.voiceStartCallback?.();
        } else {
          // 更新最后语音活动时间
          this.state.lastSpeechTime = currentTime;
        }
      } else {
        // 静音检测
        if (this.state.isSpeechDetected) {
          // 检查是否超过静音持续时间
          if (currentTime - this.state.lastSpeechTime >= this.config.silenceDuration) {
            this.state.isSpeechDetected = false;
            this.config.voiceStopCallback?.();
          }
        }
      }

      this.animationFrameId = requestAnimationFrame(detect);
    };

    this.animationFrameId = requestAnimationFrame(detect);
  }

  stopDetection(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private getVolumeLevel(): number {
    if (!this.analyser) {
      return 0;
    }

    const timeData = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(timeData);

    let sumOfSquares = 0;
    let peak = 0;
    for (let i = 0; i < timeData.length; i++) {
      const sample = timeData[i];
      sumOfSquares += sample * sample;
      peak = Math.max(peak, Math.abs(sample));
    }

    const rms = Math.sqrt(sumOfSquares / timeData.length);
    let magnitude = Math.max(rms, peak);

    if (magnitude < 0.01) {
      const freqData = new Uint8Array(this.analyser.frequencyBinCount);
      this.analyser.getByteFrequencyData(freqData);
      let sum = 0;
      for (let i = 0; i < freqData.length; i++) {
        sum += freqData[i];
      }
      const avgFrequency = sum / freqData.length / 255; // 0-1 范围
      magnitude = Math.max(magnitude, avgFrequency);
    }

    const normalized = Math.min(100, Math.max(0, Math.sqrt(magnitude) * 100));
    return normalized;
  }

  getVolume(): number {
    return this.state.volume;
  }

  isVoiceActive(): boolean {
    return this.state.isSpeechDetected;
  }

  updateConfig(newConfig: Partial<VadConfig>): void {
    const nextConfig: VadConfig = {
      ...this.config,
      ...newConfig
    };
    nextConfig.threshold = Math.max(0, Math.min(100, nextConfig.threshold));
    this.config = nextConfig;
  }
}
