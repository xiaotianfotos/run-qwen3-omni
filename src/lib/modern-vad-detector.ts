/**
 * Modern VAD Detector using AudioWorklet for better performance
 */

import { EventEmitter } from 'eventemitter3';

export interface ModernVadConfig {
  threshold: number;       // 音量阈值 (0 - 100)
  silenceDuration: number; // 静音持续时间 (毫秒)
  onVoiceStart?: () => void;
  onVoiceStop?: () => void;
}

export class ModernVadDetector extends EventEmitter {
  private config: ModernVadConfig;
  private isInitialized: boolean = false;
  private isDetecting: boolean = false;
  private currentVolume: number = 0;
  private isVoiceActive: boolean = false;
  private lastVoiceTime: number = 0;
  private volumeCallback?: (volume: number) => void;

  constructor(config: ModernVadConfig) {
    super();
    this.config = {
      threshold: config.threshold ?? 5,
      silenceDuration: config.silenceDuration ?? 800,
      onVoiceStart: config.onVoiceStart,
      onVoiceStop: config.onVoiceStop
    };
  }

  // 使用 AudioRecorder 的音量事件来实现VAD
  initialize(volumeCallback: (volume: number) => void): void {
    this.volumeCallback = volumeCallback;
    this.isInitialized = true;
  }

  startDetection(): void {
    if (!this.isInitialized || this.isDetecting) {
      return;
    }
    
    this.isDetecting = true;
    this.isVoiceActive = false;
    this.lastVoiceTime = 0;
    this.emit('detectionStarted');
  }

  stopDetection(): void {
    if (!this.isDetecting) {
      return;
    }
    
    this.isDetecting = false;
    
    // 如果当前正在检测到语音，触发停止事件
    if (this.isVoiceActive) {
      this.isVoiceActive = false;
      this.config.onVoiceStop?.();
      this.emit('voiceStop');
    }
    
    this.emit('detectionStopped');
  }

  // 处理来自 AudioRecorder 的音量数据
  processVolume(volume: number): void {
    if (!this.isDetecting) {
      return;
    }

    // 将音量从 0-1 范围转换为 0-100 范围
    const volumePercent = Math.round(volume * 100);
    this.currentVolume = volumePercent;

    const currentTime = Date.now();
    const isAboveThreshold = volumePercent > this.config.threshold;

    if (isAboveThreshold) {
      // 语音活动检测到
      if (!this.isVoiceActive) {
        this.isVoiceActive = true;
        this.lastVoiceTime = currentTime;
        this.config.onVoiceStart?.();
        this.emit('voiceStart');
      } else {
        // 更新最后语音活动时间
        this.lastVoiceTime = currentTime;
      }
    } else {
      // 静音检测
      if (this.isVoiceActive) {
        // 检查是否超过静音持续时间
        if (currentTime - this.lastVoiceTime >= this.config.silenceDuration) {
          this.isVoiceActive = false;
          this.config.onVoiceStop?.();
          this.emit('voiceStop');
        }
      }
    }

    this.emit('volumeUpdate', volumePercent);
  }

  getVolume(): number {
    return this.currentVolume;
  }

  isVoiceDetected(): boolean {
    return this.isVoiceActive;
  }

  updateConfig(newConfig: Partial<ModernVadConfig>): void {
    this.config = {
      ...this.config,
      ...newConfig
    };
    
    // 确保阈值在有效范围内
    this.config.threshold = Math.max(0, Math.min(100, this.config.threshold));
    
    this.emit('configUpdated', this.config);
  }

  getConfig(): ModernVadConfig {
    return { ...this.config };
  }

  dispose(): void {
    this.stopDetection();
    this.removeAllListeners();
    this.volumeCallback = undefined;
    this.isInitialized = false;
    this.currentVolume = 0;
    this.isVoiceActive = false;
    this.lastVoiceTime = 0;
    console.log('🧽 VAD检测器已销毁');
  }
}