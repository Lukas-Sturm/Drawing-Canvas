import {CanvasShape, Tool} from "./types.mjs"
import {SHAPE_EVENT_BUS} from "./EventManager.mjs"
import {convertShape} from "./CanvasShapes.mjs"
import {ArrayShapeStore} from "./ShapeStore.mjs"
import {EventHelper} from "./ShapeEventHelper.mjs"

export class SelectionTool implements Tool {
    label: string = 'Auswahl'

    protected shapeStore = new ArrayShapeStore<CanvasShape>()
    protected selectedShapes: CanvasShape[] = []
    protected lastCycleSelectedShape?: CanvasShape = undefined

    protected currentEventOrigin = EventHelper.generateOrigin()

    constructor() {
        this.attachShapeEventListeners()
    }

    handleMouseDown(): void {}
    handleMouseMove(): void {}

    /**
     * Perform selection logic on mouse up
     */
    handleMouseUp(x: number, y: number, e: MouseEvent): void {
        // possible selections:
        // - single click -> select shape unselect all others
        // - ctrl + click -> toggle selection and keep other selections
        //      - if there are multiples shapes on top of each other that are selected, unselect all ?
        //          -> No, just unselect the clicked shape
        // - alt + click -> cycle through shapes under the cursor, forget other selections
        // - alt + ctrl + click -> cycle through shapes under the cursor and keep other selections
        //      - how to handle toggling here ?
        //          -> Do not perform toggling, just cycle through the shapes and select them
        //          - toggling can later pe performed using Ctrl + Click
        //
        // this should allow a user to reach every shape and manipulate it

        const shapesUnderCursor =
            this.shapeStore.getShapes()
                .reverse()
                .filter(shape => shape.checkSelection(x, y))
        const selectedShapes = this.selectedShapes

        if (e.altKey) {
            this.handleAltClick(shapesUnderCursor, selectedShapes, e.ctrlKey)
        } else if (e.ctrlKey) {
            this.handleCtrlClick(shapesUnderCursor, selectedShapes)
        } else {
            this.handleSimpleClick(shapesUnderCursor)
        }

        // reset lastCycleSelectedShape if selection gets cancelled
        if (this.selectedShapes.length === 0) {
            this.lastCycleSelectedShape = undefined
        }
    }

    protected handleAltClick(
        shapesUnderCursor: Array<CanvasShape>,
        selectedShapes: Array<CanvasShape>,
        ctrlPressed: boolean
    ): void {
        // - alt + click -> cycle through shapes under the cursor, forget other selections
        // - alt + ctrl + click -> cycle through shapes under the cursor and keep other selections
        //      - how to handle toggling here ?
        //          -> Do not perform toggling, just cycle through the shapes and select them
        //          - toggling can later pe performed using Ctrl + Click

        if (shapesUnderCursor.length === 0) return // nothing happens if no shape is under the cursor
        const clickedShape = shapesUnderCursor[0]

        if (!this.lastCycleSelectedShape || shapesUnderCursor.indexOf(this.lastCycleSelectedShape) === -1) {
            // start cycling from the first shape
            this.lastCycleSelectedShape = clickedShape
            if (ctrlPressed) { // keep other selections
                if (selectedShapes.indexOf(clickedShape) === -1) {
                    // shape not selected, select it
                    this.selectShape(clickedShape)
                } else {
                    // shape was already selected when Cycle started,
                    // find next shape that is not already selected
                    for (let i = 0; i < shapesUnderCursor.length; i++) {
                        if (selectedShapes.indexOf(shapesUnderCursor[i]) === -1) {
                            this.selectShape(shapesUnderCursor[i])
                            this.lastCycleSelectedShape = shapesUnderCursor[i]
                            break
                        }
                    }
                }
            } else {
                // search for the next not already selected shape
                // set that shape as the only selected shape
                for (let i = 0; i < shapesUnderCursor.length; i++) {
                    if (selectedShapes.indexOf(shapesUnderCursor[i]) === -1) {
                        this.resetSelection()
                            .selectShape(clickedShape)
                        this.lastCycleSelectedShape = shapesUnderCursor[i]
                        break
                    }
                }
            }
        } else {
            // cycle through the shapes
            const currentIndex = shapesUnderCursor.indexOf(this.lastCycleSelectedShape)
            const nextIndex = (currentIndex + 1) % shapesUnderCursor.length
            const nextShape = shapesUnderCursor[nextIndex]
            if (ctrlPressed) {
                // keep other selections
                // search for next shape that is not already selected
                for (let i = nextIndex; i !== currentIndex; i = (i + 1) % shapesUnderCursor.length) {
                    if (selectedShapes.indexOf(shapesUnderCursor[i]) === -1) {
                        this.selectShape(shapesUnderCursor[i])
                        break
                    }
                }
            } else {
                // cycle without keeping other selections
                this.resetSelection()
                    .selectShape(nextShape)
            }
            this.lastCycleSelectedShape = nextShape
        }
    }

    protected handleCtrlClick(shapesUnderCursor: Array<CanvasShape>, selectedShapes: Array<CanvasShape>): void {
        // - ctrl + click -> toggle selection and keep other selections
        //      - if there are multiples shapes on top of each other that are selected, unselect all ?
        //          -> No, just unselect the clicked shape
        
        if (shapesUnderCursor.length === 0) return // nothing happens if no shape is under the cursor
        const clickedShape = shapesUnderCursor[0]

        // check if the clicked shape is already selected, and toggle
        const index = selectedShapes.indexOf(clickedShape)
        if (index !== -1) {
            this.unselectShape(clickedShape)
        } else {
            this.selectShape(clickedShape)
        }
    }

    protected handleSimpleClick(shapesUnderCursor: Array<CanvasShape>): void {
        // - single click -> select shape unselect all others
        this.resetSelection()
        if (shapesUnderCursor.length > 0) {
            this.selectShape(shapesUnderCursor[0])
        }
    }

    protected selectShape(shape: CanvasShape): this {
        this.selectedShapes.push(shape)
        EventHelper.sendShapeSelectedEvent(this.currentEventOrigin, shape.id, {color: '#43ff6480'})
        return this
    }

    protected unselectShape(shape: CanvasShape): this {
        this.selectedShapes = this.selectedShapes.filter(s => s.id !== shape.id)
        EventHelper.sendShapeDeselectedEvent(this.currentEventOrigin, shape.id)
        return this
    }

    protected resetSelection(): this {
        for (const shape of this.selectedShapes) {
            EventHelper.sendShapeDeselectedEvent(this.currentEventOrigin, shape.id)
        }
        this.selectedShapes = []
        return this
    }

    protected attachShapeEventListeners(): void {
        // Ideally this would use a custom Shape not containing the rendering logic
        // discarding information like color, etc.

        SHAPE_EVENT_BUS.addEventListener('ShapeAdded', (event) => {
            this.shapeStore.addShape(convertShape(event.shape))
        })

        SHAPE_EVENT_BUS.addEventListener('ShapeRemoved', (event) => {
            this.shapeStore.removeShape(event.shapeId)
            this.selectedShapes = this.selectedShapes.filter(s => s.id !== event.shapeId)
            if (this.lastCycleSelectedShape?.id === event.shapeId) {
                this.lastCycleSelectedShape = undefined
            }
        })

        SHAPE_EVENT_BUS.addEventListener('ShapeZChanged', (event) => {
            if (event.z === -Infinity) {
                this.shapeStore.sendShapeToBack(event.shapeId)
            } else if (event.z === Infinity) {
                this.shapeStore.sendShapeToFront(event.shapeId)
            } else {
                this.shapeStore.changeShapeZ(event.shapeId, event.z)
            }
        })

        SHAPE_EVENT_BUS.addEventListener('ShapeSelected', (event) => {
            if (event.origin === this.currentEventOrigin) return // do not react to own events

            const shape = this.shapeStore.getShape(event.shapeId)
            if (shape) {
                this.selectedShapes.push(shape)
            } else {
                console.warn("Shape not found for selection event", event)
            }
        })

        SHAPE_EVENT_BUS.addEventListener('ShapeDeselected', (event) => {
            if (event.origin === this.currentEventOrigin) return // do not react to own events

            this.selectedShapes = this.selectedShapes.filter(s => s.id !== event.shapeId)
        })
    }
}
