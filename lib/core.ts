import { AlignmentButtonList, BorderStyleList, defaultButtons, defaultExtendedButtons, defaultShapes, type ButtonModes } from "./defaults.js";

import * as fabric from 'fabric';
import { UndoRedoStack } from "./undo-redo-stack.js";
import { alignObject, countDecimals, getActiveFontStyle, setActiveFontStyle } from "./utils.js";
import { SaveInBrowser } from "./saveInBrowser.js";

/**
 * Image Editor class
 * @param {String} containerSelector jquery selector for image editor container
 * @param {Array} buttons define toolbar buttons
 * @param {Array} shapes define shapes
 */
export class ImageEditor {
  public canvas: fabric.Canvas;
  history: UndoRedoStack;
  mainPanelElement: HTMLElement;
  fileUploadInput: HTMLInputElement;
  toolbar: HTMLDivElement;

  activeTool: ButtonModes | undefined;
  activeSelection: fabric.FabricObject | fabric.FabricObject[] | undefined;

  constructor(
    public readonly containerElement: HTMLElement,
  ) {
    // Constrct common basic structures the interface needs to work. This avoids
    // a lot of undefined checks elsewhere..
    this.containerElement.classList.add('default-container');

    this.toolbar = this.createElement('div', 'toolbar', ['toolbar']) as HTMLDivElement;
    this.containerElement.appendChild(this.toolbar);

    this.mainPanelElement = this.createElement('div', undefined, ['main-panel']);
    this.containerElement.appendChild(this.mainPanelElement);

    const canvasElem = this.createElement('canvas', 'c') as HTMLCanvasElement;
    this.mainPanelElement.appendChild(
      this.createElement('div', 'canvas-holder', ['canvas-holder'], [
        this.createElement('div', undefined, ['content'], [canvasElem])
      ])
    );
    this.canvas = new fabric.Canvas(canvasElem, {});

    this.fileUploadInput = this.createElement('input', 'btn-image-upload') as HTMLInputElement;
    this.fileUploadInput.type = "file";
    this.fileUploadInput.accept = "image/*";
    this.fileUploadInput.multiple = true;
    this.fileUploadInput.hidden = true;
    this.containerElement.appendChild(this.fileUploadInput);
    this.fileUploadInput.addEventListener(
      'change',
      (e) => this.processFiles((e.target as HTMLInputElement).files));

    this.history = new UndoRedoStack();

    this.init();
  }

  /**
   * Get current state of canvas as object
   * @returns {Object}
   */
  public getCanvasJSON() {
    return this.canvas?.toJSON();
  }

  /**
   * Set canvas status by object
   * @param {Object} current the object of fabric canvas status
   */
  public setCanvasJSON(current: string) {
    if (this.canvas === undefined) { return; }
    this.canvas.loadFromJSON(
      JSON.parse(current),
      this.canvas.renderAll.bind(this.canvas)
    );
  }

  /**
   * Event handler to set active tool
   * @param {String} id tool id
   */
  public setActiveTool(id: ButtonModes) {
    this.activeTool = id;

    // Set only the active tool as active
    this.toolbar.querySelectorAll('button').forEach(e => e.classList.remove('active'));
    this.toolbar.querySelector(`button#${this.activeTool}`)?.classList.add('active');

    this.containerElement.querySelectorAll('.toolpanel').forEach(e => e.classList.remove('visible'));

    const activeSelection = this.canvas.getActiveObjects();

    if (id !== 'select' || (id === 'select' && activeSelection.length > 0)) {
      this.containerElement.querySelector(`.toolpanel#${id}-panel`)
        ?.classList.add('visible');

      if (id === 'select') {
        console.log('selection');
        let selectType: 'group' | 'textbox' | 'image' | 'other';
        switch (true) {
          default:
            selectType = 'other';
            break;
          case activeSelection.at(0) instanceof fabric.FabricImage:
            selectType = 'image';
            break;
          case activeSelection.at(0) instanceof fabric.Group:
            selectType = 'group';
            break;
          case activeSelection.at(0) instanceof fabric.Textbox:
            selectType = 'textbox';
            break;
        }
        this.containerElement.querySelector(`.toolpanel#select-panel`)
          ?.setAttribute('class', `toolpanel visible type-${selectType}`);
      } else {
        this.canvas.discardActiveObject();
        this.canvas.renderAll();
        this.activeSelection = undefined;
      }
    }

    this.canvas.isDrawingMode = false;
    this.canvas.defaultCursor = 'default';
    this.canvas.selection = true;
    this.canvas.forEachObject(o => {
      o.selectable = true;
      o.evented = true;
    })

    switch (id) {
      case 'line':
        this.canvas.isDrawingMode = true
        this.canvas.defaultCursor = 'crosshair'
        this.canvas.selection = false
        this.canvas.forEachObject(o => {
          o.selectable = false
          o.evented = false
        });
        break;
      case 'textbox':
        this.canvas.isDrawingMode = true
        this.canvas.defaultCursor = 'crosshair'
        this.canvas.selection = false
        this.canvas.forEachObject(o => {
          o.selectable = false
          o.evented = false
        });
        break;
      case 'upload':
        this.openDragDropPanel();
        break;
      default:
        break;
    }
  }

  /**
   * Event handler when perform undo
   */
  private async undo() {
    const op = this.history.undo();
    if (op !== undefined) {
      await this.canvas.loadFromJSON(JSON.parse(op));
      this.canvas.requestRenderAll();
    }
  }

  /**
   * Event handler when perform redo
   */
  private async redo() {
    const op = this.history.redo();
    if (op !== undefined) {
      await this.canvas.loadFromJSON(JSON.parse(op));
      this.canvas.requestRenderAll();
    }
  }

  /**
   * Event handler when select objects on fabric canvas
   * @param {Object} activeSelection fabric js object
   */
  public setActiveSelection(activeSelection: fabric.FabricObject | fabric.FabricObject[] | undefined) {
    this.activeSelection = activeSelection;
    this.setActiveTool('select');
  }

  /**
   * Initialize undo/redo stack
   */
  private configUndoRedoStack() {
    document.addEventListener('keydown', (e) => {
      const key = e.which || e.keyCode;

      if (e.ctrlKey && document.querySelectorAll('textarea:focus, input:focus').length === 0) {
        if (key === 90) this.undo() //90
        if (key === 89) this.redo() //89
      }
    });
  }

  /**
   * Initialize image editor
   */
  private init() {
    this.configUndoRedoStack();

    this.initializeToolbar();

    this.initializeShapes();

    this.initializeSelectionSettings();

    this.initializeCanvas();

    this.initializeLineDrawing();
    this.initializeTextBoxDrawing();
    this.initializeCopyPaste();

    this.extendHideShowToolPanel();
  }

  private createElement(
    tag: string,
    id?: string,
    classes: string[] = [],
    children: HTMLElement[] = [],
    textContent?: string,
  ): HTMLElement {
    const elem = document.createElement(tag);
    if (id !== undefined) {
      elem.id = id;
    }
    if (classes.length > 0) {
      elem.classList.add(...classes);
    }
    if (children.length > 0) {
      children.forEach(c => elem.appendChild(c));
    }
    if (textContent !== undefined) {
      elem.innerText = textContent;
    }
    return elem;
  }

  private createCustomNumInput(
    parent: Element,
    inputId: string,
    label: string,
    value?: number,
    min?: number,
    max?: number,
    step?: number,
  ) {
    const decrease = this.createElement('button', undefined, ['decrease'], [], "-");
    const increase = this.createElement('button', undefined, ['increase'], [], "+");
    const input = this.createElement('input', inputId) as HTMLInputElement;
    input.value = value?.toString() ?? "1";
    input.step = step?.toString() ?? "1";
    if (min   !== undefined) { input.min   = min.toString(); }
    if (max   !== undefined) { input.max   = max.toString(); }
    input.type = "number";

    const container = this.createElement('div', undefined, ['input-container'], [
      this.createElement('label', undefined, [], [], label),
      this.createElement('div', undefined, ['custom-number-input'], [
        decrease, input, increase
      ]),
    ]);
    parent.appendChild(container);

    decrease.addEventListener('click', () => {
      const step = Number(input.step);
      const val = Number(input.value);
      const newVal = val - step;
      input.value = (newVal).toFixed(countDecimals(newVal));

      input.dispatchEvent(new Event('change'));
    });
    increase.addEventListener('click', () => {
      const step = Number(input.step);
      const val = Number(input.value);
      const newVal = val + step;
      input.value = (newVal).toFixed(countDecimals(newVal));

      input.dispatchEvent(new Event('change'));
    });

    return input;
  }

  private createOption(value: string, text: string, selected =false) {
    const o = this.createElement('option') as HTMLOptionElement;
    o.value = value;
    o.text = text;
    o.selected = selected;
    return o;
  }

  /**
   * Add features to hide/show tool panel
   */
  private extendHideShowToolPanel() {
    this.containerElement.querySelectorAll('.toolpanel .content').forEach(e => {
      const elem = this.createElement('div', undefined, ['hide-show-handler']);
      e.appendChild(elem);
      elem.addEventListener('click', (e) => {
        if (!(e.currentTarget instanceof Element)) { return; }
        e.currentTarget.closest('.toolPanel')?.classList.toggle('closed');
      });
    });
  }

  private initializeToolbar() {
    const mainButtons = document.createElement('div');
    mainButtons.classList.add('main-buttons');
    this.toolbar.appendChild(mainButtons);

    defaultButtons.forEach(item => {
      const elem = document.createElement('button');
      elem.id = item.name;
      elem.innerHTML = item.icon;
      mainButtons.appendChild(elem);
      elem.addEventListener('click', () => this.setActiveTool(item.name));
    });

    const extendedButtons = document.createElement('div');
    extendedButtons.classList.add('extended-buttons');
    this.toolbar.appendChild(extendedButtons);

    defaultExtendedButtons.forEach(item => {
      const elem = document.createElement("button");
      elem.id = item.name;
      elem.innerHTML = item.icon;
      extendedButtons.appendChild(elem);
      elem.addEventListener('click', () => {
        const id = item.name;
        if (id === 'save') {
          if (window.confirm('The current canvas will be saved in your local! Are you sure?')) {
            SaveInBrowser.save('canvasEditor', this.canvas.toJSON());
          }
        } else if (id === 'clear') {
          if (window.confirm('This will clear the canvas! Are you sure?')) {
            this.canvas.clear(), SaveInBrowser.remove('canvasEditor');
          }
        } else if (id === 'undo') {
          this.undo();
        } else if (id === 'redo') {
          this.redo();
        }
      });
    });
  }

  private openDragDropPanel() {
    console.log('open drag drop panel');
    const para = this.createElement('div');
    para.innerHTML = 'Drag & drop files<br>or click to browse.<br>JPG, PNG or SVG only!';
    const dragDropInput = this.createElement('div', undefined, ['drag-drop-input'], [para]);
    const modalContent = this.createElement('div', undefined, ['custom-modal-content'], [dragDropInput]);
    const modalContainer = this.createElement('div', undefined, ['custom-modal-container'], [modalContent]);

    document.querySelector('body')?.appendChild(modalContainer);
    modalContainer.addEventListener('click', (e) => (e.currentTarget as HTMLElement).remove());

    dragDropInput.addEventListener('click', () => {
      console.log('click drag drop');
      this.fileUploadInput.dispatchEvent(new Event('click'));
    });

    dragDropInput.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      (e.target as HTMLElement).classList.add('dragging');
    });
    dragDropInput.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      (e.target as HTMLElement).classList.remove('dragging');
    });
    dragDropInput.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      (e.target as HTMLElement).classList.remove('dragging');
      if (e.dataTransfer !== null && e.dataTransfer.files.length > 0) {
        this.processFiles(e.dataTransfer.files);
        modalContainer.remove();
      }
    });
  }

  private processFiles(files: FileList | null) {
    if (!(files instanceof FileList) || files.length === 0) { return; }

    // TODO: PDF!
    const allowedTypes = ['image/jpeg', 'image/png', 'image/svg+xml'];

    for (let file of files) {
      // check type
      if (!allowedTypes.includes(file.type)) continue

      let reader = new FileReader()

      // handle svg
      if (file.type === 'image/svg+xml') {
        reader.onload = async (f) => {
          const out = await fabric.loadSVGFromString(f.target?.result as string);

          if (this.canvas === undefined) { return; }
          let obj = fabric.util.groupSVGElements(out.objects.filter(n => n !== null), out.options);
          obj.set({
            left: 0,
            top: 0
          }).setCoords()
          this.canvas.add(obj)

          this.canvas.renderAll()
          this.canvas.fire('object:modified')
        }
        reader.readAsText(file)
        continue
      }

      // handle image, read file, add to canvas
      reader.onload = async (f) => {
        const img = await fabric.FabricImage.fromURL(f.target?.result as string)
        if (this.canvas === undefined) { return; }
        img.set({
          left: 0,
          top: 0
        })
        img.scaleToHeight(300)
        img.scaleToWidth(300)
        this.canvas.add(img)

        this.canvas.renderAll()
        this.canvas.fire('object:modified')
      }

      reader.readAsDataURL(file)
    }
  }

  private initializeCanvas() {
    //try {
      this.canvas.setDimensions({
        width: 800,
        height: 600
      })

      // set up selection style
      fabric.FabricObject.prototype.transparentCorners = false;
      fabric.FabricObject.prototype.cornerStyle = 'circle';
      fabric.FabricObject.prototype.borderColor = '#C00000';
      fabric.FabricObject.prototype.cornerColor = '#C00000';
      fabric.FabricObject.prototype.cornerStrokeColor = '#FFF';
      fabric.FabricObject.prototype.padding = 0;

      // retrieve active selection to react state
      this.canvas.on('selection:created', (e) => this.setActiveSelection(e.selected))
      this.canvas.on('selection:updated', (e) => this.setActiveSelection(e.selected))
      this.canvas.on('selection:cleared', () => this.setActiveSelection(undefined))

      this.canvas.on('object:modified', () => {
        if (this.canvas === undefined) { return; }
        console.log('trigger: modified')
        let currentState = this.canvas.toJSON();
        this.history.push(JSON.stringify(currentState));
      })

      const savedCanvas = SaveInBrowser.load('canvasEditor');
      if (savedCanvas) {
        this.canvas.loadFromJSON(savedCanvas, this.canvas.renderAll.bind(this.canvas));
      }

      // move objects with arrow keys
      document.addEventListener('keydown', (e) => {
        if (this.canvas === undefined) { return; }
        const key = e.which || e.keyCode;
        const isArrow = key === 37 || key === 38 || key === 39 || key === 40;

        if (document.querySelectorAll('textarea:focus, input:focus').length > 0) return;

        if (isArrow) {
          e.preventDefault();
        }

        const activeObject = this.canvas.getActiveObject();
        if (activeObject === undefined) { return; }

        if (key === 37 && activeObject.left !== undefined) {
          activeObject.left -= 1;
        } else if (key === 39 && activeObject.left !== undefined) {
          activeObject.left += 1;
        } else if (key === 38 && activeObject.top !== undefined) {
          activeObject.top -= 1;
        } else if (key === 40 && activeObject.top !== undefined) {
          activeObject.top += 1;
        }

        if (isArrow) {
          activeObject.setCoords();
          this.canvas.renderAll();
          this.canvas.fire('object:modified');
        }
      });

      // delete object on del key
      document.addEventListener('keydown', (e) => {
        if (this.canvas === undefined) { return; }
        const key = e.which || e.keyCode;
        if (
          key === 46 &&
          document.querySelectorAll('textarea:focus, input:focus').length === 0
        ) {

          this.canvas.getActiveObjects().forEach(obj => {
            this.canvas.remove(obj);
          });

          this.canvas.discardActiveObject();
          this.canvas.requestRenderAll();
          this.canvas.fire('object:modified')
        }
      });

      setTimeout(() => {
        if (this.canvas === undefined) { return; }
        let currentState = this.canvas.toJSON();
        this.history.push(JSON.stringify(currentState));
      }, 2000);
  }

  private initializeCopyPaste() {

    // copy
    document.addEventListener('copy', async (e) => {
      const obj = this.canvas.getActiveObject();
      if (obj === undefined) { return }

      // copy image as dataUrl
      if (obj instanceof fabric.FabricImage) {
        e.preventDefault()
      }
      const clipboard = e.clipboardData;
      if (clipboard === null) {
        return;
      }

      clipboard.setData('text/plain', obj.toDataURL({}));

      // if selection is not an image, copy as JSON
      if (!(obj instanceof fabric.FabricImage)) {
        e.preventDefault();
        const cloned = await obj.clone();
        clipboard.setData('text/plain', JSON.stringify(cloned.toJSON()));
      }
    });

    // JSON string validator
    function isJSONObjectString(s: string) {
      try {
        const o = JSON.parse(s);
        return !!o && (typeof o === 'object') && !Array.isArray(o);
      } catch {
        return false;
      }
    }

    // base64 validator
    function isBase64String(str: string) {
      try {
        const s = str.split('base64,').pop();
        if (s === undefined) { return false; }
        window.atob(s);
        return true;
      } catch (e) {
        return false;
      }
    }

    // paste
    document.addEventListener('paste', async (e) => {
      if (e.clipboardData === null) {
        return;
      }

      let pasteTextData = e.clipboardData?.getData('text')

      // check if base64 image
      if (pasteTextData && isBase64String(pasteTextData)) {
        const img = await fabric.Image.fromURL(pasteTextData);

        img.set({
          left: 0,
          top: 0
        });
        img.scaleToHeight(100);
        img.scaleToWidth(100);
        this.canvas.add(img);
        this.canvas.setActiveObject(img);
        this.canvas.fire('object:modified');

        return;
      }

      // check if there's an image in clipboard items
      if (e.clipboardData.items.length > 0) {
        for (let i = 0; i < e.clipboardData.items.length; i++) {
          if (e.clipboardData.items[i].type.indexOf('image') === 0) {
            let blob = e.clipboardData.items[i].getAsFile()
            if (blob !== null) {
              let reader = new FileReader();
              reader.onload = async (f) => {
                if (f.target === null || !(typeof f.target.result === 'string')) { return; }
                const img = await fabric.Image.fromURL(f.target.result);
                  img.set({
                    left: 0,
                    top: 0
                  });
                  img.scaleToHeight(100);
                  img.scaleToWidth(100);
                  this.canvas.add(img);
                  this.canvas.setActiveObject(img);
                  this.canvas.fire('object:modified');
              }
              reader.readAsDataURL(blob);
            }
          }
        }
      }

      // check if JSON and type is valid
      let validTypes = ['rect', 'circle', 'line', 'polygon', 'polyline', 'textbox', 'group']
      if (isJSONObjectString(pasteTextData)) {
        let obj = JSON.parse(pasteTextData)
        if (!validTypes.includes(obj.type)) return

        // insert and select
        fabric.util.enlivenObjects([obj], (objects: fabric.FabricObject[]) => {
          objects.forEach((o) => {
            o.set({
              left: 0,
              top: 0
            })
            this.canvas.add(o)
            o.setCoords()
            this.canvas.setActiveObject(o)
          })
          this.canvas.requestRenderAll()
          this.canvas.fire('object:modified')
        });
      }
    });
  }

  private initializeLineDrawing() {
    let isDrawing = false,
      lineToDraw: fabric.Line, pointer

    this.canvas.on('mouse:down', (o) => {
      if (this.activeTool !== 'line') { return; }

      isDrawing = true

      pointer = this.canvas.getViewportPoint(o.e)
      lineToDraw = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], {
        strokeWidth: 2,
        stroke: '#000000'
      });
      lineToDraw.selectable = false
      lineToDraw.evented = false
      lineToDraw.strokeUniform = true
      this.canvas.add(lineToDraw);
      this.canvas.requestRenderAll();
    });

    this.canvas.on('mouse:move', (o) => {
      if (!isDrawing) { return; }

      pointer = this.canvas.getViewportPoint(o.e)

      lineToDraw.set({
        x2: pointer.x,
        y2: pointer.y
      })

      this.canvas.requestRenderAll();
    });

    this.canvas.on('mouse:up', () => {
      if (!isDrawing) { return; }

      lineToDraw.setCoords();
      isDrawing = false;
      this.canvas.fire('object:modified');
      this.canvas.requestRenderAll();
    });
  }

  private initializeTextBoxDrawing() {
    let isDrawing = false,
      textboxRect: fabric.Rect, origX: number, origY: number, pointer;

    this.canvas.on('mouse:down', (o) => {
      if (this.activeTool !== 'textbox') { return; }

      isDrawing = true;

      pointer = this.canvas.getViewportPoint(o.e);
      origX = pointer.x;
      origY = pointer.y;
      textboxRect = new fabric.Rect({
        left: origX,
        top: origY,
        width: 5,
        height: 5,
        strokeWidth: 1,
        stroke: '#C00000',
        fill: 'rgba(192, 0, 0, 0.2)',
        transparentCorners: false
      });
      this.canvas.add(textboxRect);
      this.canvas.requestRenderAll();
    });

    this.canvas.on('mouse:move', (o) => {
      if (!isDrawing) { return; }

      pointer = this.canvas.getViewportPoint(o.e);

      if (origX > pointer.x) {
        textboxRect.set({
          left: Math.abs(pointer.x)
        });
      }

      if (origY > pointer.y) {
        textboxRect.set({
          top: Math.abs(pointer.y)
        });
      }

      textboxRect.set({
        width: Math.abs(origX - pointer.x),
        height: Math.abs(origY - pointer.y)
      });

      this.canvas.requestRenderAll();
    });

    this.canvas.on('mouse:up', () => {
      if (!isDrawing) { return; }

      isDrawing = false;

      // get final rect coords and replace it with textbox
      let textbox = new fabric.Textbox('Your text goes here...', {
        left: textboxRect.left,
        top: textboxRect.top,
        width: (textboxRect.width ?? 0) < 80 ? 80 : textboxRect.width,
        fontSize: 18,
        fontFamily: "'Open Sans', sans-serif"
      });
      this.canvas.remove(textboxRect);
      this.canvas.add(textbox);
      this.canvas.setActiveObject(textbox);
      textbox.setControlsVisibility({
        'mb': false
      });
      this.canvas.fire('object:modified');
      this.canvas.requestRenderAll();
    });
  }

  private initializeShapes() {
    const contentElem = this.createElement('div', undefined, ['content'], [
      this.createElement('p', undefined, ['title'], [], "Shapes")
    ]);
    this.mainPanelElement.appendChild(
      this.createElement('div', 'shapes-panel', ['toolpanel'], [contentElem])
    );

    defaultShapes.forEach(svg => {
      const elem = this.createElement('div', undefined, ['button'])
      elem.innerHTML = svg;
      contentElem.appendChild(elem);
      elem.addEventListener('click', async () => {
        const out = await fabric.loadSVGFromString(elem.getHTML());
        var obj = fabric.util.groupSVGElements(out.objects.filter(o => o !== null), out.options);
        obj.strokeUniform = true
        obj.strokeLineJoin = 'miter'
        obj.scaleToWidth(100)
        obj.scaleToHeight(100)
        obj.set({
          left: 0,
          top: 0
        });
        this.canvas.add(obj);
        this.canvas.renderAll();
        this.canvas.fire('object:modified');
      });
    });
  }

  private initializeSelectionSettings() {
    const contentElem = this.createElement('div', undefined, ['content'], [
      this.createElement('p', undefined, ['title'], [], "Selection Settings")
    ]);
    this.mainPanelElement.appendChild(
      this.createElement('div', 'select-panel', ['toolpanel'], [contentElem])
    );

    // font section
    {
      const textSection = this.createElement('div', undefined, ['text-section'], [
        this.createElement('h4', undefined, [], [], 'Font Style')
      ]);
      contentElem.appendChild(textSection);

      // Font style
      {
        const styles = [
          {
            style: "bold",
            icon: `<svg id="Capa_1" x="0px" y="0px" viewBox="-70 -70 450 450" xml:space="preserve"><path d="M218.133,144.853c20.587-14.4,35.2-37.653,35.2-59.52C253.333,37.227,216.107,0,168,0H34.667v298.667h150.187 c44.693,0,79.147-36.267,79.147-80.853C264,185.387,245.547,157.76,218.133,144.853z M98.667,53.333h64c17.707,0,32,14.293,32,32 s-14.293,32-32,32h-64V53.333z M173.333,245.333H98.667v-64h74.667c17.707,0,32,14.293,32,32S191.04,245.333,173.333,245.333z"></path></svg>`,
            callback: () => {
              const sel = this.canvas.getActiveObjects();
              if (sel.at(0) instanceof fabric.Textbox) {
                setActiveFontStyle(
                  sel, 'fontWeight',
                  getActiveFontStyle(sel, 'fontWeight') === 'bold' ? '' : 'bold'
                );
                this.canvas.renderAll(), this.canvas.fire('object:modified');
              }
            }
          },
          {
            style: "italic",
            icon: `<svg id="Capa_1" x="0px" y="0px" viewBox="-70 -70 450 450" xml:space="preserve"><polygon points="106.667,0 106.667,64 153.92,64 80.747,234.667 21.333,234.667 21.333,298.667 192,298.667 192,234.667 144.747,234.667 217.92,64 277.333,64 277.333,0  "></polygon></svg>`,
            callback: () => {
              const sel = this.activeSelection as fabric.IText;
              setActiveFontStyle(
                sel, 'fontStyle',
                getActiveFontStyle(sel, 'fontStyle') === 'italic' ? '' : 'italic'
              );

              this.canvas.renderAll(), this.canvas.fire('object:modified');
            }
          },
          {
            style: "underline",
            icon: `<svg id="Capa_1" x="0px" y="0px" viewBox="-70 -70 450 450" xml:space="preserve"><path d="M192,298.667c70.72,0,128-57.28,128-128V0h-53.333v170.667c0,41.28-33.387,74.667-74.667,74.667 s-74.667-33.387-74.667-74.667V0H64v170.667C64,241.387,121.28,298.667,192,298.667z"></path><rect x="42.667" y="341.333" width="298.667" height="42.667"></rect></svg>`,
            callback: () => {
              const sel = this.activeSelection as fabric.IText;
              setActiveFontStyle(
                sel, 'underline',
                !getActiveFontStyle(sel, 'underline')
              );

              this.canvas.renderAll(), this.canvas.fire('object:modified');
            }
          },
          {
            style: "linethrough",
            icon: `<svg id="Capa_1" x="0px" y="0px" viewBox="-70 -70 450 450" xml:space="preserve"><polygon points="149.333,160 234.667,160 234.667,96 341.333,96 341.333,32 42.667,32 42.667,96 149.333,96"></polygon><rect x="149.333" y="288" width="85.333" height="64"></rect><rect x="0" y="202.667" width="384" height="42.667"></rect></svg>`,
            callback: () => {
              const sel = this.activeSelection as fabric.IText;
              setActiveFontStyle(
                sel, 'linethrough',
                !getActiveFontStyle(sel, 'linethrough')
              );

              this.canvas.renderAll(), this.canvas.fire('object:modified');
            }
          },
          {
            style: "subscript",
            icon: `<svg id="Capa_1" x="0px" y="0px" viewBox="0 0 512 512" xml:space="preserve"><path d="M248.257,256l103.986-103.758c2.777-2.771,4.337-6.532,4.337-10.455c0-3.923-1.561-7.684-4.337-10.455l-49.057-48.948 c-5.765-5.753-15.098-5.753-20.863,0L178.29,186.188L74.258,82.384c-5.764-5.751-15.098-5.752-20.863,0L4.337,131.333 C1.561,134.103,0,137.865,0,141.788c0,3.923,1.561,7.684,4.337,10.455L108.324,256L4.337,359.758 C1.561,362.528,0,366.29,0,370.212c0,3.923,1.561,7.684,4.337,10.455l49.057,48.948c5.765,5.753,15.098,5.753,20.863,0 l104.033-103.804l104.032,103.804c2.883,2.876,6.657,4.315,10.432,4.315s7.549-1.438,10.432-4.315l49.056-48.948 c2.777-2.771,4.337-6.532,4.337-10.455c0-3.923-1.561-7.684-4.337-10.455L248.257,256z"></path><path d="M497.231,384.331h-44.973l35.508-31.887c14.878-13.36,20.056-34.18,13.192-53.04 c-6.874-18.89-23.565-31.044-43.561-31.717c-0.639-0.021-1.283-0.032-1.928-0.032c-31.171,0-56.531,25.318-56.531,56.439 c0,8.157,6.613,14.769,14.769,14.769c8.156,0,14.769-6.613,14.769-14.769c0-14.833,12.109-26.901,26.992-26.901 c0.316,0,0.631,0.005,0.937,0.016c11.573,0.39,15.78,9.511,16.795,12.297c2.163,5.946,1.942,14.574-5.171,20.962l-64.19,57.643 c-4.552,4.088-6.112,10.56-3.923,16.273c2.189,5.714,7.673,9.486,13.792,9.486h83.523c8.157,0,14.769-6.613,14.769-14.769 S505.387,384.331,497.231,384.331z"></path></svg>`,
            callback: () => {
              const sel = this.activeSelection as fabric.IText;
              if (getActiveFontStyle(sel, 'deltaY') > 0) {
                setActiveFontStyle(sel, 'fontSize', undefined)
                setActiveFontStyle(sel, 'deltaY', undefined)
              } else {
                this.activeSelection
                sel.setSubscript(sel.selectionStart!, sel.selectionEnd!);
              }

              this.canvas.renderAll(), this.canvas.fire('object:modified');
            }
          },
          {
            style: "superscript",
            icon: `<svg id="Capa_1" x="0px" y="0px" viewBox="0 0 512 512" xml:space="preserve"><path d="M248.257,259.854l103.986-103.758c2.777-2.771,4.337-6.532,4.337-10.455c0-3.923-1.561-7.684-4.337-10.455l-49.057-48.948 c-5.765-5.753-15.098-5.753-20.863,0L178.29,190.042L74.258,86.238c-5.764-5.751-15.099-5.752-20.863,0L4.337,135.187 C1.561,137.958,0,141.719,0,145.642s1.561,7.684,4.337,10.455l103.986,103.758L4.337,363.612C1.561,366.383,0,370.145,0,374.067 c0,3.922,1.561,7.684,4.337,10.455l49.057,48.948c5.765,5.753,15.098,5.753,20.863,0l104.033-103.804l104.032,103.804 c2.883,2.876,6.657,4.315,10.432,4.315s7.549-1.438,10.432-4.315l49.056-48.948c2.777-2.771,4.337-6.532,4.337-10.455 s-1.561-7.684-4.337-10.455L248.257,259.854z"></path><path d="M497.231,190.893h-44.973l35.508-31.887c14.878-13.36,20.056-34.18,13.192-53.04 c-6.874-18.89-23.565-31.044-43.561-31.717c-0.639-0.021-1.283-0.032-1.928-0.032c-31.171,0-56.531,25.318-56.531,56.439 c0,8.157,6.613,14.769,14.769,14.769c8.156,0,14.769-6.613,14.769-14.769c0-14.833,12.109-26.901,26.992-26.901 c0.316,0,0.631,0.005,0.937,0.016c11.573,0.39,15.78,9.511,16.795,12.297c2.163,5.946,1.942,14.574-5.171,20.962l-64.19,57.643 c-4.552,4.088-6.112,10.56-3.923,16.273c2.189,5.714,7.673,9.486,13.792,9.486h83.523c8.157,0,14.769-6.613,14.769-14.769 S505.387,190.893,497.231,190.893z"></path></svg>`,
            callback: () => {
              const sel = this.activeSelection as fabric.IText;
              if (getActiveFontStyle(sel, 'deltaY') < 0) {
                setActiveFontStyle(sel, 'fontSize', undefined)
                setActiveFontStyle(sel, 'deltaY', undefined)
              } else {
                sel.setSuperscript(sel.selectionStart!, sel.selectionEnd!);
              }

              this.canvas.renderAll(), this.canvas.fire('object:modified');
            }
          },
        ] as const;

        const styleContainer = this.createElement('div', undefined, ['style']);
        textSection.appendChild(styleContainer);
        styles.forEach(s => {
          const b = this.createElement('button', s.style);
          b.innerHTML = s.icon;
          styleContainer.appendChild(b);
          b.addEventListener('click', () => s.callback.bind(this));
        });
      }

      // Font family
      {
        const fontFamily = this.createElement('select', 'font-family', [], [
          this.createOption("'Open Sans', sans-serif", "Open Sans"),
          this.createOption("'Oswald', sans-serif", "Oswald"),
          this.createOption("'Playfair Display', serif", "Playfair Display"),
          this.createOption("'Cormorant Garamond', serif", "Cormorant Garamond"),
          this.createOption("Impact, Charcoal, sans-serif", "Impact"),
          this.createOption("'Lucida Console', Monaco, monospace", "Lucida Console"),
          this.createOption("'Comic Sans MS', 'Comic Sans', cursive, sans-serif", "Comic Sans"),
          this.createOption("'Dancing Script', cursive", "Dancing Script"),
          this.createOption("'Indie Flower', cursive", "Indie Flower"),
          this.createOption("'Amatic SC', cursive", "Amatic SC"),
          this.createOption("'Permanent Marker', cursive", "Permanent Marker"),
        ]) as HTMLSelectElement;

        textSection.appendChild(
          this.createElement('div', undefined, ['family'], [
            this.createElement('div', undefined, ['input-container'], [
              this.createElement('label', undefined, [], [], 'Font Family'),
              fontFamily
            ])
          ])
        );

        fontFamily.addEventListener('change', () => {
          setActiveFontStyle(this.activeSelection as fabric.IText, 'fontFamily', fontFamily.value);
          this.canvas.renderAll(), this.canvas.fire('object:modified');
        });
      }

      // Font sizes
      {
        const sizes = this.createElement('div', undefined, ['sizes']);
        textSection.appendChild(sizes);

        const fontSize = this.createCustomNumInput(sizes, 'fontSize', 'Font Size', 20, 1);
        fontSize.addEventListener('change', () => {
          setActiveFontStyle(this.activeSelection as fabric.IText, 'fontSize', Number(fontSize.value));
          this.canvas.renderAll(), this.canvas.fire('object:modified');
        });
        const lineHeight = this.createCustomNumInput(sizes, 'lineHeight', 'Line Height', 1, 0, 3, 0.1);
        lineHeight.addEventListener('change', () => {
          setActiveFontStyle(this.activeSelection as fabric.IText, 'lineHeight', Number(lineHeight.value));
          this.canvas.renderAll(), this.canvas.fire('object:modified');
        });
        const charSpacing = this.createCustomNumInput(sizes, 'charSpacing', 'Letter Spacing', 0, 0, 2000, 100);
        charSpacing.addEventListener('change', () => {
          setActiveFontStyle(this.activeSelection as fabric.IText, 'charSpacing', Number(charSpacing.value));
          this.canvas.renderAll(), this.canvas.fire('object:modified');
        });
        sizes.appendChild(this.createElement('p'));
      }

      // Font align
      {
        const fontSelect = this.createElement('select', 'text-align', [], [
          this.createOption("left", "Left"),
          this.createOption("center", "Center"),
          this.createOption("right", "Right"),
          this.createOption("justify", "Justify"),
        ]) as HTMLSelectElement;
        textSection.appendChild(
          this.createElement('div', undefined, ['align'], [
            this.createElement('div', undefined, ['input-container'], [
              this.createElement('label', undefined, [], [], 'Text Alignment'),
              fontSelect,
            ])
          ])
        );
        fontSelect.addEventListener('change', () => {
          setActiveFontStyle(this.activeSelection as fabric.IText, 'textAlign', fontSelect.value);
          this.canvas.renderAll(), this.canvas.fire('object:modified');
        });
      }

      // Font color
      {
        const colorPicker = this.createElement('input', 'color-picker-text') as HTMLInputElement;
        colorPicker.type = 'color';
        colorPicker.value = '#000000';

        textSection.appendChild(
          this.createElement('div', undefined, ['color'], [
            this.createElement('div', undefined, ['input-container'], [
              this.createElement('label', undefined, [], [], 'Text Color'),
              colorPicker
            ])
          ])
        );
        colorPicker.addEventListener('change', () => {
          setActiveFontStyle(this.activeSelection as fabric.IText, 'fill', colorPicker.value);
          this.canvas.renderAll(), this.canvas.fire('object:modified');
        });
      }

      textSection.appendChild(this.createElement('hr'));
    }
    // end font section

    // border section
    {
      const borderSection = this.createElement('div', undefined, ['border-section'], [
        this.createElement('h4', undefined, [], [], 'Border'),
      ]);
      contentElem.appendChild(borderSection);

      const borderInput = this.createCustomNumInput(borderSection, 'input-border-width', 'Width', 1, 1);
      borderInput.addEventListener('change', () => {
        this.canvas.getActiveObjects().forEach(obj => obj.set({
          strokeUniform: true,
          strokeWidth: Number(borderInput.value)
        }));
        this.canvas.renderAll(), this.canvas.fire('object:modified');
      });

      const borderStyle = this.createElement(
        'select',
        'input-border-style',
        [],
        BorderStyleList.map(i => this.createOption(JSON.stringify(i.value), i.label))
      ) as HTMLSelectElement;
      borderSection.appendChild(
        this.createElement('div', undefined, ['input-container'], [
          this.createElement('label', undefined, [], [], 'Style'),
          borderStyle,
        ])
      );
      borderStyle.addEventListener('change', () => {
        try {
          let style = JSON.parse(borderStyle.value);
          this.canvas.getActiveObjects().forEach(obj => obj.set({
            strokeUniform: true,
            strokeDashArray: style.strokeDashArray,
            strokeLineCap: style.strokeLineCap
          }));
          this.canvas.renderAll(), this.canvas.fire('object:modified')
        } catch (_) { }
      });

      const cornerType = this.createElement('select', 'input-corner-type', [], [
        this.createOption("miter", "Square", true),
        this.createOption("round", "Round")
      ]) as HTMLSelectElement;
      borderSection.appendChild(
        this.createElement('div', undefined, ['input-container'], [
          this.createElement('label', undefined, [], [], 'Corner Type'),
          cornerType,
        ])
      );
      cornerType.addEventListener('change', () => {
        this.canvas.getActiveObjects().forEach(obj => obj.set('strokeLineJoin', cornerType.value))
        this.canvas.renderAll(), this.canvas.fire('object:modified')
      });

      const colorPicker = this.createElement('input', 'color-picker-border') as HTMLInputElement;
      colorPicker.type = 'color';
      colorPicker.value = '#000000';
      borderSection.appendChild(
        this.createElement('div', undefined, ['input-container'], [
          this.createElement('label', undefined, [], [], 'Color'),
          colorPicker,
        ])
      );
      colorPicker.addEventListener('input', () => {
        this.canvas.getActiveObjects().forEach(obj => obj.set('stroke', colorPicker.value));
        this.canvas.renderAll(), this.canvas.fire('object:modified');
      });

      contentElem.appendChild(this.createElement('hr'));
    }
    // end border section

    // fill color section
    {
      const tabContainer = this.createElement('div', undefined, ['tab-container'], [
        this.createElement('div', undefined, ['tabs'], [
          this.createElement('div', undefined, ['tab-label', 'active'], [], 'Color Fill')
        ])
      ]);
      contentElem.appendChild(
        this.createElement('div', undefined, ['fill-section'], [tabContainer])
      );
      const colorPicker = this.createElement('input', 'color-picker-fill') as HTMLInputElement;
      colorPicker.type = 'color';
      colorPicker.value = '#000000';
      tabContainer.appendChild(
        this.createElement('div', undefined, ['tab-content'], [colorPicker])
      );

      colorPicker.addEventListener('input', () => {
        this.canvas.getActiveObjects().forEach(obj => obj.set('fill', colorPicker.value));
        this.canvas.renderAll(); this.canvas.fire('object:modified');
      });

    }
    // end fill color section

    // alignment section
    {
      const alignmentSection = this.createElement('div', undefined, ['alignment-section'], [
        this.createElement('h4', undefined, [], [], "Alignment")
      ]);
      contentElem.appendChild(alignmentSection);

      AlignmentButtonList.forEach(item => {
        const btn = this.createElement('button');
        btn.dataset.pos = item.pos;
        btn.innerHTML = item.icon;
        alignmentSection.appendChild(btn);
        btn.addEventListener('click', () => {
          const selected = this.canvas.getActiveObjects();
          selected.forEach(o => alignObject(this.canvas, o, item.pos));
        });
      });
      alignmentSection.appendChild(this.createElement('hr'));
    }
    // end alignment section

    // object options section
    {
      const objectOptions = this.createElement('div', undefined, ['object-options'], [this.createElement('h4', undefined, [], [], "Object Options")]);
      contentElem.appendChild(objectOptions);

      const fliph = this.createElement('button', 'flip-h');
      fliph.innerHTML = `<svg width="512" height="512" enable-background="new 0 0 16 16" viewBox="0 0 16 20" xml:space="preserve"><g transform="matrix(0 1.5365 1.5385 0 -5.0769 1.5495)"><rect x="5" y="8" width="1" height="1"></rect><rect x="7" y="8" width="1" height="1"></rect><rect x="9" y="8" width="1" height="1"></rect><rect x="1" y="8" width="1" height="1"></rect><rect x="3" y="8" width="1" height="1"></rect><path d="M 1,2 5.5,6 10,2 Z M 7.37,3 5.5,4.662 3.63,3 Z"></path><polygon points="10 15 5.5 11 1 15"></polygon></g></svg>`;
      objectOptions.appendChild(fliph);
      fliph.addEventListener('click', () => {
        const selected = this.canvas.getActiveObjects();
        selected.forEach(o => o.flipX = !o.flipX);
        this.canvas.requestRenderAll();
        this.canvas.fire('object:modified');
      });

      const flipv = this.createElement('button', 'flip-v');
      flipv.innerHTML = `<svg width="512" height="512" enable-background="new 0 0 16 16" viewBox="0 0 16 20" xml:space="preserve"><g transform="matrix(1.5365 0 0 1.5385 -.45052 -3.0769)"><rect x="5" y="8" width="1" height="1"></rect><rect x="7" y="8" width="1" height="1"></rect><rect x="9" y="8" width="1" height="1"></rect><rect x="1" y="8" width="1" height="1"></rect><rect x="3" y="8" width="1" height="1"></rect><path d="M 1,2 5.5,6 10,2 Z M 7.37,3 5.5,4.662 3.63,3 Z"></path><polygon points="5.5 11 1 15 10 15"></polygon></g></svg>`;
      objectOptions.appendChild(flipv);
      flipv.addEventListener('click', () => {
        const selected = this.canvas.getActiveObjects();
        selected.forEach(o => o.flipY = !o.flipY);
        this.canvas.requestRenderAll();
        this.canvas.fire('object:modified');
      });

      const bringFwd = this.createElement('button', 'bringFwd');
      bringFwd.innerHTML = `<svg x="0px" y="0px" viewBox="0 0 1000 1000" enable-background="new 0 0 1000 1000" xml:space="preserve"><g><path d="M10,10h686v686H10V10 M990,304v686H304V794h98v98h490V402h-98v-98H990z"></path></g></svg>`;
      objectOptions.appendChild(bringFwd);
      bringFwd.addEventListener('click', () => {
        this.canvas.bringObjectForward(this.canvas?.getActiveObject()!);
        this.canvas.renderAll(), this.canvas.fire('object:modified');
      });

      const bringBack = this.createElement('button', 'bringBack');
      bringBack.innerHTML = `<svg enable-background="new 0 0 1000 1000" viewBox="0 0 1e3 1e3" xml:space="preserve"><path d="m990 990h-686v-686h686v686m-980-294v-686h686v680h-98v-582h-490v490h200v98z"></path><rect x="108.44" y="108" width="490" height="490" fill="#fff"></rect></svg>`;
      objectOptions.appendChild(bringBack);
      bringBack.addEventListener('click', () => {
        this.canvas.sendObjectBackwards(this.canvas?.getActiveObject()!);
        this.canvas.renderAll(), this.canvas.fire('object:modified');
      });

      const duplicate = this.createElement('button', 'duplicate');
      duplicate.innerHTML = `<svg id="Capa_1" x="0px" y="0px" viewBox="0 0 512 512" xml:space="preserve"><g><g><g><path d="M42.667,256c0-59.52,35.093-110.827,85.547-134.827V75.2C53.653,101.44,0,172.48,0,256s53.653,154.56,128.213,180.8 v-45.973C77.76,366.827,42.667,315.52,42.667,256z"></path><path d="M320,64c-105.92,0-192,86.08-192,192s86.08,192,192,192s192-86.08,192-192S425.92,64,320,64z M320,405.333 c-82.347,0-149.333-66.987-149.333-149.333S237.653,106.667,320,106.667S469.333,173.653,469.333,256 S402.347,405.333,320,405.333z"></path><polygon points="341.333,170.667 298.667,170.667 298.667,234.667 234.667,234.667 234.667,277.333 298.667,277.333 298.667,341.333 341.333,341.333 341.333,277.333 405.333,277.333 405.333,234.667 341.333,234.667  "></polygon></g></g></g></svg>`;
      objectOptions.appendChild(duplicate);
      duplicate.addEventListener('click', async () => {
        let activeObjects = this.canvas.getActiveObjects()
        const clonedObjects: fabric.FabricObject[] = await Promise.all(activeObjects.map(async obj => {
          const clone = await obj.clone();
          this.canvas.add(clone.set({
            strokeUniform: true,
            left: obj.aCoords!.tl.x + 20,
            top: obj.aCoords!.tl.y + 20
          }));

          return clone;
        }));

        if (clonedObjects.length > 1) {
          let sel = new fabric.ActiveSelection(clonedObjects, {
            canvas: this.canvas,
          });
          this.canvas.setActiveObject(sel)
        } else if (clonedObjects.length === 1) {
          this.canvas.setActiveObject(clonedObjects[0])
        }

        this.canvas.requestRenderAll(), this.canvas.fire('object:modified')
      });

      const deleteo = this.createElement('button', 'delete');
      deleteo.innerHTML = `<svg id="Layer_1" x="0px" y="0px" viewBox="0 0 512 512" xml:space="preserve"><g><g><path d="M425.298,51.358h-91.455V16.696c0-9.22-7.475-16.696-16.696-16.696H194.855c-9.22,0-16.696,7.475-16.696,16.696v34.662 H86.704c-9.22,0-16.696,7.475-16.696,16.696v51.357c0,9.22,7.475,16.696,16.696,16.696h5.072l15.26,359.906 c0.378,8.937,7.735,15.988,16.68,15.988h264.568c8.946,0,16.302-7.051,16.68-15.989l15.259-359.906h5.073 c9.22,0,16.696-7.475,16.696-16.696V68.054C441.994,58.832,434.519,51.358,425.298,51.358z M211.551,33.391h88.9v17.967h-88.9 V33.391z M372.283,478.609H139.719l-14.522-342.502h261.606L372.283,478.609z M408.602,102.715c-15.17,0-296.114,0-305.202,0 V84.749h305.202V102.715z"></path></g></g><g><g><path d="M188.835,187.304c-9.22,0-16.696,7.475-16.696,16.696v206.714c0,9.22,7.475,16.696,16.696,16.696 c9.22,0,16.696-7.475,16.696-16.696V204C205.53,194.779,198.055,187.304,188.835,187.304z"></path></g></g><g><g><path d="M255.998,187.304c-9.22,0-16.696,7.475-16.696,16.696v206.714c0,9.22,7.474,16.696,16.696,16.696 c9.22,0,16.696-7.475,16.696-16.696V204C272.693,194.779,265.218,187.304,255.998,187.304z"></path></g></g><g><g><path d="M323.161,187.304c-9.22,0-16.696,7.475-16.696,16.696v206.714c0,9.22,7.475,16.696,16.696,16.696 s16.696-7.475,16.696-16.696V204C339.857,194.779,332.382,187.304,323.161,187.304z"></path></g></g></svg>`;
      objectOptions.appendChild(deleteo);
      deleteo.addEventListener('click', () => {
        this.canvas.getActiveObjects().forEach(obj => this.canvas.remove(obj))
        this.canvas.discardActiveObject();
        this.canvas.requestRenderAll();
        this.canvas.fire('object:modified');
      });

      const group = this.createElement('button', 'group');
      group.innerHTML = `<svg width="248" height="249" viewBox="0 0 248 249"><g><rect fill="none" id="canvas_background" height="251" width="250" y="-1" x="-1"></rect><g display="none" overflow="visible" y="0" x="0" height="100%" width="100%" id="canvasGrid"><rect fill="url(#gridpattern)" stroke-width="0" y="0" x="0" height="100%" width="100%"></rect></g></g><g><rect id="svg_1" height="213.999997" width="213.999997" y="18.040149" x="16.8611" stroke-width="14" stroke="#000" fill="none"></rect><ellipse ry="39.5" rx="39.5" id="svg_2" cy="87.605177" cx="90.239139" stroke-opacity="null" stroke-width="5" stroke="#000" fill="#000000"></ellipse><rect id="svg_3" height="61.636373" width="61.636373" y="135.606293" x="133.750604" stroke-opacity="null" stroke-width="5" stroke="#000" fill="#000000"></rect><rect id="svg_4" height="26.016205" width="26.016205" y="4.813006" x="3.999997" stroke-opacity="null" stroke-width="8" stroke="#000" fill="#000000"></rect><rect id="svg_5" height="26.016205" width="26.016205" y="3.999999" x="217.820703" stroke-opacity="null" stroke-width="8" stroke="#000" fill="#000000"></rect><rect id="svg_7" height="26.016205" width="26.016205" y="218.633712" x="3.999997" stroke-opacity="null" stroke-width="8" stroke="#000" fill="#000000"></rect><rect id="svg_8" height="26.016205" width="26.016205" y="218.633712" x="217.820694" stroke-opacity="null" stroke-width="8" stroke="#000" fill="#000000"></rect></g></svg>`;
      objectOptions.appendChild(group);
      group.addEventListener('click', () => {
        const selected = this.canvas.getActiveObjects();
        if (selected.length > 1) {
          selected.forEach(o => this.canvas.remove(o));
          this.canvas.discardActiveObject();
        }
        const group = new fabric.Group(selected);
        this.canvas.add(group);
        this.canvas.requestRenderAll();
        this.canvas.fire('object:modified');
      });

      const ungroup = this.createElement('button', 'ungroup');
      ungroup.innerHTML = `<svg width="247.99999999999997" height="248.99999999999997" viewBox="0 0 248 249"><g><rect fill="none" id="canvas_background" height="251" width="250" y="-1" x="-1"></rect><g display="none" overflow="visible" y="0" x="0" height="100%" width="100%" id="canvasGrid"><rect fill="url(#gridpattern)" stroke-width="0" y="0" x="0" height="100%" width="100%"></rect></g></g><g><rect stroke-dasharray="20" id="svg_1" height="213.999997" width="213.999997" y="18.040149" x="16.8611" stroke-width="16" stroke="#000" fill="none"></rect><ellipse ry="39.5" rx="39.5" id="svg_2" cy="87.605177" cx="90.239139" stroke-opacity="null" stroke-width="5" stroke="#000" fill="#000000"></ellipse><rect id="svg_3" height="61.636373" width="61.636373" y="135.606293" x="133.750604" stroke-opacity="null" stroke-width="5" stroke="#000" fill="#000000"></rect></g></svg>`;
      objectOptions.appendChild(ungroup);
      ungroup.addEventListener('click', () => {
        const object = this.canvas.getActiveObject();
        if (object instanceof fabric.Group) {
          this.canvas.remove(object);
          this.canvas.add(...object.removeAll());
        }
        this.canvas.requestRenderAll();
        this.canvas.fire('object:modified');
      });

      objectOptions.appendChild(this.createElement('hr'));
    }
    // end object options section
  }
}
