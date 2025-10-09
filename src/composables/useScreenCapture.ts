import { ref, onUnmounted, type Ref } from 'vue';

export interface UseScreenCaptureResult {
  stream: Ref<MediaStream | null>;
  error: Ref<Error | null>;
  isStreaming: Ref<boolean>;
  startScreenCapture: () => Promise<void>;
  stopScreenCapture: () => void;
  captureFrame: (quality?: number) => Promise<string>;
  getStreamingStatus: () => boolean;
}

export function useScreenCapture(): UseScreenCaptureResult {
  const stream = ref<MediaStream | null>(null);
  const error = ref<Error | null>(null);
  const isStreaming = ref(false);
  const videoElement = ref<HTMLVideoElement | null>(null);

  const constraints = {
    video: {
      cursor: 'always',
      displaySurface: 'window'
    }
  };

  const handleStreamEnded = () => {
    isStreaming.value = false;
    stream.value = null;
  };

  const startScreenCapture = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getDisplayMedia(constraints);
      stream.value = mediaStream;
      isStreaming.value = true;
      
      // 创建视频元素
      if (!videoElement.value) {
        videoElement.value = document.createElement('video');
        videoElement.value.autoplay = true;
        videoElement.value.style.display = 'none';
        document.body.appendChild(videoElement.value);
      }
      
      // 连接流到视频元素
      videoElement.value.srcObject = mediaStream;
      
      // 添加流结束事件监听
      mediaStream.getTracks().forEach(track => {
        track.addEventListener('ended', handleStreamEnded);
      });
    } catch (err) {
      error.value = err as Error;
      isStreaming.value = false;
    }
  };

  const stopScreenCapture = () => {
    if (stream.value) {
      stream.value.getTracks().forEach(track => {
        track.removeEventListener('ended', handleStreamEnded);
        track.stop();
      });
      stream.value = null;
      isStreaming.value = false;
    }
    
    // 清理视频元素
    if (videoElement.value) {
      document.body.removeChild(videoElement.value);
      videoElement.value = null;
    }
  };

  const captureFrame = async (quality: number = 0.8): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!isStreaming.value || !videoElement.value) {
        reject(new Error('Screen capture is not active'));
        return;
      }

      try {
        // 创建 canvas 元素
        const canvas = document.createElement('canvas');
        canvas.width = videoElement.value.videoWidth;
        canvas.height = videoElement.value.videoHeight;

        // 将视频帧绘制到 canvas
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        ctx.drawImage(videoElement.value, 0, 0);

        // 将 canvas 内容转换为 base64 图片数据
        const imageData = canvas.toDataURL('image/jpeg', quality);
        // 移除 base64 URL 前缀
        const base64Data = imageData.split(',')[1];

        resolve(base64Data);
      } catch (err) {
        reject(err);
      }
    });
  };

  // 立即同步检查流状态
  const getStreamingStatus = (): boolean => {
    return isStreaming.value && !!stream.value && !!videoElement.value;
  };

  // 组件卸载时自动清理
  onUnmounted(() => {
    stopScreenCapture();
  });

  return {
    stream,
    error,
    isStreaming,
    startScreenCapture,
    stopScreenCapture,
    captureFrame,
    getStreamingStatus,
  };
}