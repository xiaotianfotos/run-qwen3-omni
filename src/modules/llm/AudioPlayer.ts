import { EventEmitter } from 'eventemitter3';

export interface AudioPlayerConfig {
  volume?: number;
  playbackRate?: number;
}

export class AudioPlayer extends EventEmitter {
  private audioContext: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private config: AudioPlayerConfig;

  constructor(config: Partial<AudioPlayerConfig> = {}) {
    super();
    this.config = {
      volume: 1.0,
      playbackRate: 1.0,
      ...config
    };
  }

  async initialize(): Promise<void> {
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = this.config.volume || 1.0;
      this.gainNode.connect(this.audioContext.destination);
      
      this.emit('initialized');
    } catch (error) {
      console.error('Failed to initialize AudioContext:', error);
      throw error;
    }
  }

  async play(audioData: ArrayBuffer): Promise<void> {
    if (!this.audioContext || !this.gainNode) {
      throw new Error('AudioPlayer not initialized');
    }

    try {
      // 解码音频数据
      const audioBuffer = await this.audioContext.decodeAudioData(audioData);
      
      // 创建音频源
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.playbackRate.value = this.config.playbackRate || 1.0;
      
      // 连接节点
      source.connect(this.gainNode);
      
      // 播放音频
      source.start(0);
      
      // 发射播放开始事件
      this.emit('playbackStarted');
      
      // 在音频播放完成后发射结束事件
      source.onended = () => {
        this.emit('playbackEnded');
      };
    } catch (error) {
      console.error('Error playing audio:', error);
      this.emit('playbackError', error);
      throw error;
    }
  }

  setVolume(volume: number): void {
    if (this.gainNode) {
      this.gainNode.gain.value = Math.max(0, Math.min(1, volume));
      this.config.volume = volume;
      this.emit('volumeChanged', volume);
    }
  }

  getVolume(): number {
    return this.config.volume || 1.0;
  }

  pause(): void {
    // Note: Web Audio API doesn't provide direct pause functionality
    // We would need to implement this differently if needed
    this.emit('playbackPaused');
  }

  resume(): void {
    this.emit('playbackResumed');
  }

  stop(): void {
    // We can't directly stop all audio sources in Web Audio API
    // Each source needs to be stopped individually
    this.emit('playbackStopped');
  }

  dispose(): void {
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
    }
    this.removeAllListeners();
  }
}