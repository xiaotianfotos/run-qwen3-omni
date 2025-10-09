export interface Screenshot {
  id: string;
  image: string; // Data URL
  timestamp: number;
  width: number;
  height: number;
}

export class ScreenshotManager {
  private screenshots: Screenshot[] = [];
  private maxSize: number;
  private maxWidth: number;
  private maxHeight: number;

  constructor(maxSize: number = 10, maxWidth: number = 1920, maxHeight: number = 1080) {
    this.maxSize = maxSize;
    this.maxWidth = maxWidth;
    this.maxHeight = maxHeight;
  }

  addScreenshot(imageData: string, width: number = this.maxWidth, height: number = this.maxHeight): void {
    // 处理图像大小
    const processedImage = this.processImage(imageData, width, height);
    
    const screenshot: Screenshot = {
      id: `screenshot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      image: processedImage,
      timestamp: Date.now(),
      width: this.maxWidth,
      height: this.maxHeight
    };

    this.screenshots.push(screenshot);

    // 限制截图数量
    if (this.screenshots.length > this.maxSize) {
      this.screenshots = this.screenshots.slice(-this.maxSize);
    }
  }

  getLatestScreenshots(count: number = this.maxSize): Screenshot[] {
    return this.screenshots.slice(-count);
  }

  getAllScreenshots(): Screenshot[] {
    return [...this.screenshots];
  }

  getScreenshotById(id: string): Screenshot | undefined {
    return this.screenshots.find(screenshot => screenshot.id === id);
  }

  clear(): void {
    this.screenshots = [];
  }

  removeScreenshot(id: string): boolean {
    const initialLength = this.screenshots.length;
    this.screenshots = this.screenshots.filter(screenshot => screenshot.id !== id);
    return this.screenshots.length < initialLength;
  }

  getSize(): number {
    return this.screenshots.length;
  }

  private processImage(imageData: string, width: number, height: number): string {
    // 如果图像已经是合适的尺寸则直接返回
    if (width <= this.maxWidth && height <= this.maxHeight) {
      return imageData;
    }

    // 使用canvas来调整图像大小
    const img = new Image();
    img.src = imageData;

    // 创建一个临时canvas来调整图像大小
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      console.error('Could not get canvas context');
      return imageData; // 如果无法创建canvas上下文，则返回原始图像
    }

    // 计算缩放比例
    const scaleX = this.maxWidth / width;
    const scaleY = this.maxHeight / height;
    const scale = Math.min(scaleX, scaleY, 1); // 不要放大图像

    const newWidth = width * scale;
    const newHeight = height * scale;

    canvas.width = newWidth;
    canvas.height = newHeight;

    // 绘制调整大小的图像
    ctx.drawImage(img, 0, 0, newWidth, newHeight);

    // 返回调整大小后的图像
    return canvas.toDataURL('image/jpeg', 0.8); // 使用JPEG格式，质量为80%
  }
}