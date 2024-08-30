import baseDrawingStyles from '../styles/DrawingCanvas.css?inline'
import {Menu, MenuItem, SeparatorMenuItem} from './Menu.mjs'
import {ContextMenuItemFactory, CanvasShape} from "../types.mjs"
import {ToolArea} from "./ToolArea.mjs"
import {convertShape} from "../CanvasShapes.mjs"
import {ArrayShapeStore} from "../ShapeStore.mjs"

import {SHAPE_EVENT_BUS} from "../EventBus.mjs";

type DrawingCanvasOptions = {
    width: number,
    height: number
}

export class DrawingCanvas extends HTMLElement {
    readonly config: DrawingCanvasOptions = {
        width: 500,
        height: 500
    }

    protected shapeStore = new ArrayShapeStore<CanvasShape>()
    protected contextBuilders: Array<{priority: number, builder: () => Array<MenuItem>}> = []
    protected requestedRedraw = false

    protected canvas: HTMLCanvasElement
    protected selectionCanvas: HTMLCanvasElement
    protected canvasRenderCtx: CanvasRenderingContext2D
    protected selectionCanvasRenderCtx: CanvasRenderingContext2D
    protected infoParagraph: HTMLParagraphElement
    protected componentDOM: ShadowRoot
    protected toolArea: ToolArea

    constructor() {
        super()

        if (this.hasAttribute('tool-area')) {
            const toolAreaId = this.getAttribute('tool-area')
            if (!toolAreaId) throw new Error('Tool Area ID is required')
            this.toolArea = document.getElementById(toolAreaId) as ToolArea
            if (!this.toolArea) throw new Error('Tool Area not found')
        } else {
            throw new Error('Tool Area is required, add tool-area attribute pointing to Tool Area ID to the element')
        }

        this.componentDOM = this.attachShadow({ mode: 'open' })
        this.componentDOM.adoptedStyleSheets.push(this.buildStyles())

        this.infoParagraph = document.createElement('p')
        this.infoParagraph.id = 'mouseStats'

        const canvasWrapper = document.createElement('div')
        canvasWrapper.classList.add('canvasWrapper')

        this.canvas = document.createElement('canvas')
        this.canvas.width = this.config.width
        this.canvas.height = this.config.height
        const ctx = this.canvas.getContext('2d')
        if (!ctx) throw new Error('Could not get 2d context')
        this.canvasRenderCtx = ctx
        this.canvas.id = 'mainCanvas'
        canvasWrapper.appendChild(this.canvas)

        this.selectionCanvas = document.createElement('canvas')
        this.selectionCanvas.width = this.config.width
        this.selectionCanvas.height = this.config.height
        const highlightCtx = this.selectionCanvas.getContext('2d')
        if (!highlightCtx) throw new Error('Could not get 2d context for highlight canvas')
        this.selectionCanvasRenderCtx = highlightCtx
        this.selectionCanvas.classList.add('highlightCanvas')
        canvasWrapper.appendChild(this.selectionCanvas)

        this.attachListeners()
        this.componentDOM.appendChild(canvasWrapper)
        this.componentDOM.appendChild(this.infoParagraph)

        this.attachShapeEventListeners()
    }

    attachContextMenuItemFactory(builder: ContextMenuItemFactory, priority: number = 100) {
        this.contextBuilders.push({priority, builder})
        this.contextBuilders.sort((a, b) => b.priority - a.priority)
    }

    redraw() {
        this.draw()
        this.drawSelection()
    }

    protected draw() {
        this.canvasRenderCtx.clearRect(0, 0, this.config.width, this.config.height)

        // draw shapes
        this.canvasRenderCtx.fillStyle = 'black'
        for (const shape of this.shapeStore.getShapes()) {
            shape.draw(this.canvasRenderCtx)
        }
    }

    protected drawSelection() {
        this.selectionCanvasRenderCtx.clearRect(0, 0, this.config.width, this.config.height)
        this.shapeStore.getShapes().forEach((shape) => shape.drawSelection(this.selectionCanvasRenderCtx))
    }

    protected buildContextMenu(): Menu | null {
        const contextMenu = new Menu()
        this.contextBuilders.forEach(({builder}, i) => {
            const items = builder()
            if (items.length > 0) {
                if (i != 0) {
                    contextMenu.addItem(new SeparatorMenuItem())
                }
                contextMenu.addItems(...items)
            }
        })

        if (contextMenu.getItemCount() === 0) return null
        return contextMenu
    }

    /**
     * Request a redraw of the canvas on the next animation frame
     * Can be called multiple times, but will only trigger one redraw per frame
     * @protected
     */
    protected requestRedraw(){
        if (!this.requestedRedraw) {
            this.requestedRedraw = true
            requestAnimationFrame(() => {
                this.redraw()
                this.requestedRedraw = false
            })
        }
    }

    protected attachShapeEventListeners() {
        SHAPE_EVENT_BUS.addEventListener('ShapeAdded', (event) => {
            this.shapeStore.addShape(convertShape(event.shape))
            this.requestRedraw()
        })

        SHAPE_EVENT_BUS.addEventListener('ShapeRemoved', (event) => {
            this.shapeStore.removeShape(event.shapeId)
            this.requestRedraw()
        })

        SHAPE_EVENT_BUS.addEventListener('ShapeZChanged', (event) => {
            if (event.z === -Infinity) {
                this.shapeStore.sendShapeToBack(event.shapeId)
            } else if (event.z === Infinity) {
                this.shapeStore.sendShapeToFront(event.shapeId)
            } else {
                this.shapeStore.changeShapeZ(event.shapeId, event.z)
            }
            this.requestRedraw()
        })

        SHAPE_EVENT_BUS.addEventListener('ShapeSelected', (event) => {
            const shape = this.shapeStore.getShape(event.shapeId)
            if (shape) {
                shape.selectionOptions = event.options
                this.requestRedraw()
            } else {
                console.warn("Shape not found for selection event", event)
            }
        })

        SHAPE_EVENT_BUS.addEventListener('ShapeDeselected', (event) => {
            const shape = this.shapeStore.getShape(event.shapeId)
            if (shape) {
                shape.selectionOptions = undefined
                this.requestRedraw()
            } else {
                console.warn("Shape not found for selection event", event)
            }
        })

        SHAPE_EVENT_BUS.addEventListener('ShapeUpdated', (event) => {
            const canvasShape = this.shapeStore.getShape(event.shape.id)
            if (!canvasShape) { return }
            // replaces old shape
            const shape = canvasShape.toShape()
            Object.assign(shape, event.shape)
            const newShape = convertShape(shape)
            newShape.selectionOptions = this.shapeStore.getShape(event.shape.id)?.selectionOptions
            this.shapeStore.addShape(newShape)
            this.requestRedraw()
        })
    }

    protected attachListeners() {
        // use selectionCanvas for mouse events, as it is on top of the main canvas

        // Update Canvas Status
        this.selectionCanvas.addEventListener('mousemove', (e) => {
            this.infoParagraph.textContent = `${e.offsetX}, ${e.offsetY}`
        })

        // Context Menu on right click
        this.componentDOM.addEventListener('contextmenu', (e: Event) => {
            if (!(e instanceof MouseEvent)) return
            e.preventDefault()

            const contextMenu = this.buildContextMenu()
            if (!contextMenu) return

            contextMenu.show(e.clientX, e.clientY)
        })

        const debounce: {e: MouseEvent, delta: number, timeout: number | undefined} = {
            e: new MouseEvent('mousemove'),
            delta: 0,
            timeout: undefined
        }

        // Handler for shape factories
        this.selectionCanvas.addEventListener('mousemove', (e) => {
            if (e.button !== 0) return

            debounce.delta += Math.abs(e.offsetX - debounce.e.offsetX) + Math.abs(e.offsetY - debounce.e.offsetY)
            debounce.e = e

            if (debounce.delta > 20) {
                this.toolArea.getSelectedTool()?.handleMouseMove(e.offsetX, e.offsetY, e)
                debounce.delta = 0

                window.clearTimeout(debounce.timeout)
                debounce.timeout = undefined
            }
            
            // start a timeout to send event
            // this allows persice mouse movement, sub debounce movement
            if (debounce.timeout) return
            debounce.timeout = window.setTimeout(() => {
                this.toolArea.getSelectedTool()?.handleMouseMove(debounce.e.offsetX, debounce.e.offsetY, debounce.e)
                debounce.delta = 0
                debounce.timeout = undefined
            }, 80)
        })
        this.selectionCanvas.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return
            this.toolArea.getSelectedTool()?.handleMouseDown(e.offsetX, e.offsetY, e)
        })
        this.selectionCanvas.addEventListener('mouseup', (e) => {
            if (e.button !== 0) return
            this.toolArea.getSelectedTool()?.handleMouseUp(e.offsetX, e.offsetY, e)
        })
    }

    protected buildStyles(config: DrawingCanvasOptions = this.config): CSSStyleSheet {
        // test composable stylesheet to configure the width and height and override id selector
        const styles = new CSSStyleSheet()
        styles.replaceSync(baseDrawingStyles)
        styles.insertRule(`#mainCanvas { width: ${config.width}px; height: ${config.height}px }`)
        styles.insertRule(`.canvasWrapper { width: ${config.width}px; height: ${config.height}px }`)

        return styles
    }
}

customElements.define('hs-drawing-canvas', DrawingCanvas)
