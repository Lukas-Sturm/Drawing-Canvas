import baseDrawingStyles from './DrawingCanvas.css?inline'
import {Menu, MenuItem, SeparatorMenuItem} from './Menu.mjs'
import {ContextMenuItemFactory, Shape} from "./types.mjs"
import {ToolArea} from "./ToolArea.mjs"

type DrawingCanvasOptions = {
    width: number,
    height: number
}

export class DrawingCanvas extends HTMLElement {
    readonly config: DrawingCanvasOptions = {
        width: 500,
        height: 500
    }

    protected canvas: HTMLCanvasElement
    protected selectionCanvas: HTMLCanvasElement
    protected canvasRenderCtx: CanvasRenderingContext2D
    protected selectionCanvasRenderCtx: CanvasRenderingContext2D
    protected infoParagraph: HTMLParagraphElement
    protected componentDOM: ShadowRoot
    protected toolArea: ToolArea

    protected contextBuilders: Array<{priority: number, builder: () => Array<MenuItem>}> = []

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
    }

    draw(shapes: Shape[]) {
        this.canvasRenderCtx.clearRect(0, 0, this.config.width, this.config.height)

        // draw shapes
        this.canvasRenderCtx.fillStyle = 'black'
        for (const shape of shapes) {
            shape.draw(this.canvasRenderCtx)
        }
    }

    drawSelection(shapes: Shape[]) {
        this.selectionCanvasRenderCtx.clearRect(0, 0, this.config.width, this.config.height)

        shapes.forEach((shape) => shape.drawSelection(this.selectionCanvasRenderCtx, {color: '#43ff6480'}))
    }

    attachContextMenuItemFactory(builder: ContextMenuItemFactory, priority: number = 100) {
        this.contextBuilders.push({priority, builder})
        this.contextBuilders.sort((a, b) => b.priority - a.priority)
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

        // Handler for shape factories
        this.selectionCanvas.addEventListener('mousemove', (e) => {
            if (e.button !== 0) return
            this.toolArea.getSelectedTool()?.handleMouseMove(e.offsetX, e.offsetY, e)
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
