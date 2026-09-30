import * as fabric from 'fabric';
import { loadPdfAsImage } from './pdfImageLoader';

/**
 * Загрузка растрового изображения (PNG, JPG, WebP, BMP, GIF)
 */
export function loadImageFile(file: File): Promise<fabric.FabricImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const img = new Image();
      
      img.onload = () => {
        const fabricImg = new fabric.FabricImage(img);
        resolve(fabricImg);
      };
      
      img.onerror = () => {
        reject(new Error(`Не удалось загрузить изображение: ${file.name}`));
      };
      
      img.src = e.target?.result as string;
    };
    
    reader.onerror = () => {
      reject(new Error(`Ошибка чтения файла: ${file.name}`));
    };
    
    reader.readAsDataURL(file);
  });
}

/**
 * Загрузка SVG файла
 */
export function loadSvgFile(file: File): Promise<fabric.FabricObject> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      const svgString = e.target?.result as string;
      
      try {
        const result = await fabric.loadSVGFromString(svgString);
        const objects = result.objects.filter(obj => obj !== null) as fabric.FabricObject[];
        
        // Принудительно чёрный цвет для всех элементов
        objects.forEach((obj: any) => {
          if (obj.fill) {
            obj.set('fill', '#000000');
          }
          if (obj.stroke) {
            obj.set('stroke', '#000000');
          }
        });
        
        // Если только один объект, возвращаем его
        if (objects.length === 1) {
          resolve(objects[0]);
        } else {
          // Иначе создаём группу
          const group = new fabric.Group(objects);
          resolve(group);
        }
      } catch (error) {
        reject(new Error(`Ошибка загрузки SVG: ${file.name}`));
      }
    };
    
    reader.onerror = () => {
      reject(new Error(`Ошибка чтения SVG файла: ${file.name}`));
    };
    
    reader.readAsText(file);
  });
}

/**
 * Загрузка PDF файла как изображения
 */
export async function loadPdfFile(file: File, pageNumber: number = 1): Promise<fabric.FabricImage> {
  const result = await loadPdfAsImage(file, pageNumber);
  const dataUrl = result.canvas.toDataURL('image/png');
  
  return new Promise((resolve, reject) => {
    const img = new Image();
    
    img.onload = () => {
      const fabricImg = new fabric.FabricImage(img);
      resolve(fabricImg);
    };
    
    img.onerror = () => {
      reject(new Error('Не удалось преобразовать PDF в изображение'));
    };
    
    img.src = dataUrl;
  });
}

/**
 * Автомасштабирование изображения под размер канваса
 */
export function fitImageToCanvas(
  image: fabric.FabricImage,
  canvas: fabric.Canvas,
  maxPercent: number = 90
): void {
  const canvasWidth = canvas.getWidth();
  const canvasHeight = canvas.getHeight();
  
  const imgWidth = image.width || 1;
  const imgHeight = image.height || 1;
  
  const scaleX = (canvasWidth * maxPercent / 100) / imgWidth;
  const scaleY = (canvasHeight * maxPercent / 100) / imgHeight;
  const scale = Math.min(scaleX, scaleY);
  
  image.scale(scale);
  image.set({
    left: canvasWidth / 2,
    top: canvasHeight / 2,
    originX: 'center',
    originY: 'center'
  });
}

/**
 * Обработка загруженного файла и добавление на канвас
 */
export async function handleFileUpload(
  file: File,
  canvas: fabric.Canvas,
  onPdfPageSelect?: (file: File) => void
): Promise<void> {
  const fileType = file.type.toLowerCase();
  const fileName = file.name.toLowerCase();
  
  try {
    let fabricObject: fabric.FabricObject;
    
    // PDF файлы
    if (fileType === 'application/pdf' || fileName.endsWith('.pdf')) {
      // Если есть callback для выбора страницы, вызываем его
      if (onPdfPageSelect) {
        onPdfPageSelect(file);
        return;
      }
      // Иначе загружаем первую страницу
      fabricObject = await loadPdfFile(file, 1);
    }
    // SVG файлы
    else if (fileType === 'image/svg+xml' || fileName.endsWith('.svg')) {
      fabricObject = await loadSvgFile(file);
    }
    // Растровые изображения
    else if (fileType.startsWith('image/')) {
      fabricObject = await loadImageFile(file);
    } else {
      throw new Error(`Неподдерживаемый тип файла: ${file.type}`);
    }
    
    // Автомасштабирование
    if (fabricObject instanceof fabric.FabricImage) {
      fitImageToCanvas(fabricObject, canvas);
    } else if (fabricObject instanceof fabric.Group) {
      // Для SVG групп тоже масштабируем
      const canvasWidth = canvas.getWidth();
      const canvasHeight = canvas.getHeight();
      const groupWidth = fabricObject.width || 1;
      const groupHeight = fabricObject.height || 1;
      
      const scaleX = (canvasWidth * 0.9) / groupWidth;
      const scaleY = (canvasHeight * 0.9) / groupHeight;
      const scale = Math.min(scaleX, scaleY);
      
      fabricObject.scale(scale);
      fabricObject.set({
        left: canvasWidth / 2,
        top: canvasHeight / 2,
        originX: 'center',
        originY: 'center'
      });
    }
    
    // Добавляем на канвас
    canvas.add(fabricObject);
    canvas.setActiveObject(fabricObject);
    canvas.renderAll();
    
  } catch (error) {
    console.error('Ошибка загрузки файла:', error);
    throw error;
  }
}
