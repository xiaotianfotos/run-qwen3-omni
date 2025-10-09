import { EventEmitter } from 'eventemitter3'

// 音频数据接口
export interface AudioData {
  buffer: ArrayBuffer
  durationMs: number
  sampleRate: number
  channelCount: number
}

/**
 * 音频处理策略接口
 */
export interface AudioProcessingStrategy {
  encodeAudio(chunks: ArrayBuffer[], sampleRate: number, channelCount: number): Promise<AudioData>
}

/**
 * WAV编码策略
 */
export class WavEncodingStrategy implements AudioProcessingStrategy {
  async encodeAudio(chunks: ArrayBuffer[], sampleRate: number, channelCount: number): Promise<AudioData> {
    if (!chunks.length) {
      throw new Error('No audio chunks to encode')
    }

    const totalBytes = chunks.reduce((acc, chunk) => acc + chunk.byteLength, 0)
    if (totalBytes === 0) {
      throw new Error('Empty audio chunks')
    }

    // 合并音频块
    const mergedBuffer = new ArrayBuffer(totalBytes)
    const mergedView = new Uint8Array(mergedBuffer)
    let offset = 0
    for (const chunk of chunks) {
      mergedView.set(new Uint8Array(chunk), offset)
      offset += chunk.byteLength
    }

    // 转换为WAV格式
    const wavBuffer = this.pcm16ToWavBuffer(mergedBuffer, sampleRate, channelCount)
    const base64 = this.bufferToBase64(wavBuffer)

    // 计算时长
    const bytesPerSample = 2
    const totalSamples = totalBytes / bytesPerSample
    const durationMs = Math.round((totalSamples / sampleRate) * 1000)

    return {
      buffer: wavBuffer,
      durationMs,
      sampleRate,
      channelCount
    }
  }

  private pcm16ToWavBuffer(pcmBuffer: ArrayBuffer, sampleRate: number, channelCount: number): ArrayBuffer {
    const channels = Math.max(1, channelCount || 1)
    const bytesPerSample = 2
    const blockAlign = channels * bytesPerSample
    const byteRate = sampleRate * blockAlign
    const dataLength = pcmBuffer.byteLength

    const buffer = new ArrayBuffer(44 + dataLength)
    const view = new DataView(buffer)
    let offset = 0

    const writeString = (value: string) => {
      for (let i = 0; i < value.length; i++) {
        view.setUint8(offset++, value.charCodeAt(i))
      }
    }

    const writeUint32 = (value: number) => {
      view.setUint32(offset, value, true)
      offset += 4
    }

    const writeUint16 = (value: number) => {
      view.setUint16(offset, value, true)
      offset += 2
    }

    // WAV头部
    writeString('RIFF')
    writeUint32(36 + dataLength)
    writeString('WAVE')
    writeString('fmt ')
    writeUint32(16)
    writeUint16(1)
    writeUint16(channels)
    writeUint32(sampleRate)
    writeUint32(byteRate)
    writeUint16(blockAlign)
    writeUint16(16)
    writeString('data')
    writeUint32(dataLength)

    // 音频数据
    const pcmView = new Uint8Array(pcmBuffer)
    new Uint8Array(buffer, 44).set(pcmView)

    return buffer
  }

  private bufferToBase64(buffer: ArrayBuffer): string {
    let binary = ''
    const bytes = new Uint8Array(buffer)

    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i])
    }

    return btoa(binary)
  }
}

/**
 * 音频处理服务
 */
export class AudioProcessingService extends EventEmitter {
  private strategy: AudioProcessingStrategy

  constructor(strategy: AudioProcessingStrategy = new WavEncodingStrategy()) {
    super()
    this.strategy = strategy
  }

  setStrategy(strategy: AudioProcessingStrategy): void {
    this.strategy = strategy
  }

  async processAudioChunks(
    chunks: ArrayBuffer[], 
    sampleRate: number, 
    channelCount: number
  ): Promise<AudioData> {
    try {
      return await this.strategy.encodeAudio(chunks, sampleRate, channelCount)
    } catch (error) {
      this.emit('error', error)
      throw error
    }
  }

  validateAudioData(audioData: AudioData, minDurationMs: number = 250): boolean {
    return audioData.durationMs >= minDurationMs && audioData.buffer.byteLength > 0
  }
}