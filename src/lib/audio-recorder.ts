/**
 * Modern AudioRecorder implementation using AudioWorklet
 * Based on the example implementation with improved error handling
 */

import { audioContext } from "./utils";
import AudioRecordingWorklet from "./worklets/audio-processing";
import VolMeterWorklet from "./worklets/vol-meter";
import { createWorkletFromSrc } from "./audioworklet-registry";
import EventEmitter from "eventemitter3";

function arrayBufferToBase64(buffer: ArrayBuffer) {
  var binary = "";
  var bytes = new Uint8Array(buffer);
  var len = bytes.byteLength;
  for (var i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

export class AudioRecorder extends EventEmitter {
  stream: MediaStream | undefined;
  audioContext: AudioContext | undefined;
  source: MediaStreamAudioSourceNode | undefined;
  recording: boolean = false;
  recordingWorklet: AudioWorkletNode | undefined;
  vuWorklet: AudioWorkletNode | undefined;

  private starting: Promise<void> | null = null;

  constructor(public sampleRate = 16000) {
    super();
  }

  setStream(stream: MediaStream) {
    // 如果已经有流，先停止它
    if (this.stream) {
      this.stream.getTracks().forEach(track => {
        track.enabled = false;
        track.stop();
      });
    }
    this.stream = stream;
  }

  async start() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("Could not request user media");
    }

    this.starting = new Promise(async (resolve, reject) => {
      try {
        // 如果没有外部设置的流，则请求新的流
        if (!this.stream) {
          this.stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              sampleRate: { ideal: this.sampleRate }
            } 
          });
        }

        // 如果已经有 audioContext，先关闭它
        if (this.audioContext) {
          await this.audioContext.close();
        }
        
        this.audioContext = await audioContext({ sampleRate: this.sampleRate });
        if (!this.audioContext || !this.stream) {
          throw new Error('Failed to initialize audio context or stream');
        }
        this.source = this.audioContext.createMediaStreamSource(this.stream);

        const workletName = "audio-recorder-worklet";
        const src = createWorkletFromSrc(workletName, AudioRecordingWorklet);

        await this.audioContext.audioWorklet.addModule(src);
        this.recordingWorklet = new AudioWorkletNode(
          this.audioContext!,
          workletName,
        );

        this.recordingWorklet.port.onmessage = async (ev: MessageEvent) => {
          // worklet processes recording floats and messages converted buffer
          const arrayBuffer = ev.data.data.int16arrayBuffer;

          if (arrayBuffer) {
            const arrayBufferString = arrayBufferToBase64(arrayBuffer);
            this.emit("data", arrayBufferString);
          }
        };
        this.source.connect(this.recordingWorklet);

        // vu meter worklet
        const vuWorkletName = "vu-meter";
        await this.audioContext.audioWorklet.addModule(
          createWorkletFromSrc(vuWorkletName, VolMeterWorklet),
        );
        this.vuWorklet = new AudioWorkletNode(this.audioContext!, vuWorkletName);
        this.vuWorklet.port.onmessage = (ev: MessageEvent) => {
          this.emit("volume", ev.data.volume);
        };

        this.source.connect(this.vuWorklet);
        this.recording = true;
        resolve();
        this.starting = null;
      } catch (err) {
        reject(err);
        this.starting = null;
      }
    });

    return this.starting;
  }

  async stop() {
    // its plausible that stop would be called before start completes
    // such as if the websocket immediately hangs up
    const handleStop = async () => {
      // 立即停止所有音轨
      if (this.stream) {
        const tracks = this.stream.getTracks();
        for (const track of tracks) {
          track.enabled = false;
          track.stop();
        }
        this.stream = undefined;
      }

      // 先断开所有工作节点的连接
      if (this.recordingWorklet) {
        try {
          this.source?.disconnect(this.recordingWorklet);
          this.recordingWorklet.disconnect();
          this.recordingWorklet.port.onmessage = null;
          this.recordingWorklet = undefined;
        } catch (err) {
          console.warn('Error disconnecting recording worklet:', err);
        }
      }

      if (this.vuWorklet) {
        try {
          this.source?.disconnect(this.vuWorklet);
          this.vuWorklet.disconnect();
          this.vuWorklet.port.onmessage = null;
          this.vuWorklet = undefined;
        } catch (err) {
          console.warn('Error disconnecting vu worklet:', err);
        }
      }

      // 断开音频源连接
      if (this.source) {
        try {
          this.source.disconnect();
          this.source = undefined;
        } catch (err) {
          console.warn('Error disconnecting audio source:', err);
        }
      }

      // 关闭音频上下文
      if (this.audioContext) {
        try {
          await this.audioContext.close();
          this.audioContext = undefined;
        } catch (err) {
          console.warn('Error closing audio context:', err);
        }
      }

      this.recording = false;
      
      // 触发停止事件
      this.emit("stopped");
    };
    
    if (this.starting) {
      try {
        await this.starting;
      } catch (err) {
        console.warn('Error waiting for start completion:', err);
      }
    }
    await handleStop();
  }

  isRecording(): boolean {
    return this.recording;
  }

  getAudioContext(): AudioContext | undefined {
    return this.audioContext;
  }
}
