/**
 * Define util functions
 */

import * as fabric from "fabric";

export function countDecimals(val: number) {
  if(Math.floor(val.valueOf()) === val.valueOf()) return 0;
  return val.toString().split(".")[1].length || 0;
}

export async function getRealBBox(obj: fabric.Object) {

  let tempCanv: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D;
  let w: number;
  let h: number;

  // we need to use a temp canvas to get imagedata
  function getImageData(dataUrl?: string): Promise<Uint8ClampedArray> {
    if (tempCanv === undefined) {
      tempCanv = document.createElement('canvas');
      tempCanv.style.border = '1px solid blue';
      tempCanv.style.position = 'absolute';
      tempCanv.style.top = '-100%';
      tempCanv.style.visibility = 'hidden';
      ctx = tempCanv.getContext('2d')!;
      document.body.appendChild(tempCanv);
    }

    return new Promise(function (resolve, reject) {
      if (dataUrl === undefined) return reject();

      var image = new Image();
      image.addEventListener('load', () => {
        w = image.width;
        h = image.height;
        tempCanv.width = w;
        tempCanv.height = h;
        ctx.drawImage(image, 0, 0, w, h);

        var imageData = ctx.getImageData(0, 0, w, h).data;
        resolve(imageData);
      });
      image.src = dataUrl;
    });
  }


  // analyze pixels 1-by-1
  function scanPixels(imageData: Uint8ClampedArray) {
    var data = new Uint32Array(imageData),
      x, y, y1, y2, x1 = w,
      x2 = 0;

    // y1
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        if (data[y * w + x] & 0xff000000) {
          y1 = y;
          y = h;
          break;
        }
      }
    }
    y1 ??= h - 1;

    // y2
    for (y = h - 1; y > y1; y--) {
      for (x = 0; x < w; x++) {
        if (data[y * w + x] & 0xff000000) {
          y2 = y;
          y = 0;
          break;
        }
      }
    }
    y2 ??= y1 + 1;

    // x1
    for (y = y1; y < y2; y++) {
      for (x = 0; x < w; x++) {
        if (x < x1 && data[y * w + x] & 0xff000000) {
          x1 = x;
          break;
        }
      }
    }

    // x2
    for (y = y1; y < y2; y++) {
      for (x = w - 1; x > x1; x--) {
        if (x > x2 && data[y * w + x] & 0xff000000) {
          x2 = x;
          break;
        }
      }
    }

    return {
      x1: x1,
      x2: x2,
      y1: y1,
      y2: y2,
      width: x2 - x1,
      height: y2 - y1
    }
  }

  let data = await getImageData(obj.toDataURL({}));

  return scanPixels(data);
}

/**
 * Align objects on canvas according to the pos
 * @param {Object} canvas fabric js canvas
 * @param {Array} activeSelection the array of fabric js objects
 * @param {String} pos the position to align left/center-h/right/top/center-v/bottom
 */
export function alignObject(
  canvas: fabric.Canvas,
  activeSelection: fabric.Object,
  pos: string,
): void {
  switch (pos) {
    case 'left':

      (async () => {
        let bound = activeSelection.getBoundingRect();
        let realBound = await getRealBBox(activeSelection);
        activeSelection.set('left', (activeSelection.left! - bound.left - realBound.x1));
        activeSelection.setCoords()
        canvas.renderAll()
        canvas.fire('object:modified')
      })()

      break

    case 'center-h':

      (async () => {
        let bound = activeSelection.getBoundingRect()
        let realBound = await getRealBBox(activeSelection)
        activeSelection.set(
          'left',
          (activeSelection.left! - bound.left - realBound.x1) + (canvas.width! / 2) - (realBound.width / 2)
        )
        activeSelection.setCoords()
        canvas.renderAll()
        canvas.fire('object:modified')
      })()

      break

    case 'right':

      (async () => {
        let bound = activeSelection.getBoundingRect()
        let realBound = await getRealBBox(activeSelection)
        activeSelection.set('left', (activeSelection.left! - bound.left - realBound.x1) + canvas.width! - realBound.width)
        activeSelection.setCoords()
        canvas.renderAll()
        canvas.fire('object:modified')
      })()

      break

    case 'top':

      (async () => {
        let bound = activeSelection.getBoundingRect()
        let realBound = await getRealBBox(activeSelection)
        activeSelection.set('top', (activeSelection.top! - bound.top - realBound.y1!))
        activeSelection.setCoords()
        canvas.renderAll()
        canvas.fire('object:modified')
      })()

      break

    case 'center-v':

      (async () => {
        let bound = activeSelection.getBoundingRect()
        let realBound = await getRealBBox(activeSelection)
        activeSelection.set(
          'top',
          (activeSelection.top! - bound.top - realBound.y1!) + (canvas.height! / 2) - (realBound.height / 2)
        )
        activeSelection.setCoords()
        canvas.renderAll()
        canvas.fire('object:modified')
      })()

      break

    case 'bottom':

      (async () => {
        let bound = activeSelection.getBoundingRect()
        let realBound = await getRealBBox(activeSelection)
        activeSelection.set(
          'top',
          (activeSelection.top! - bound.top - realBound.y1!) + (canvas.height! - realBound.height)
        )
        activeSelection.setCoords()
        canvas.renderAll()
        canvas.fire('object:modified')
      })()

      break

    default:
      break
  }
}

export function getActiveFontStyle(
  activeSelection: fabric.Textbox,
  styleName: keyof Partial<fabric.CompleteTextStyleDeclaration>
) {
  if (activeSelection.isEditing) {
    let styles = activeSelection.getSelectionStyles();
    return styles.find(s => s[styleName]);
  }
  return '';
  if (activeSelection.getSelectionStyles && activeSelection.isEditing) {
    let styles = activeSelection.getSelectionStyles()
    if (styles.find(o => o[styleName] === '')) {
      return ''
    }

    return styles[0][styleName]
  }

  return activeSelection.get(styleName) || '';
}

export function setActiveFontStyle(
  activeSelection: fabric.Textbox,
  styleName: keyof fabric.IText,
  value: any
) {
  if (activeSelection.setSelectionStyles && activeSelection.isEditing) {
    let style: Partial<fabric.IText> = {}
    style[styleName] = value;
    activeSelection.fontWeight
    activeSelection.setSelectionStyles(style)
    activeSelection.setCoords()
  } else {
    activeSelection.set(styleName, value)
  }
}

export function inRange(
  radius: number,
  cursorX: number,
  cursorY: number,
  targetX: number,
  targetY: number
): boolean {
  return Math.abs(cursorX - targetX) <= radius
      && Math.abs(cursorY - targetY) <= radius;
}
