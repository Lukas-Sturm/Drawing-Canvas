import {CanvasShape, Point2D, SelectionOptions, Tool} from "./types.mjs"
import {convertShape} from "./CanvasShapes.mjs"
import {ArrayShapeStore} from "./ShapeStore.mjs"
import {ShapeHelper} from "./Utils/ShapeHelper.mjs";

import {EventHelper} from "./ShapeEvents.mjs";
import {SHAPE_EVENT_BUS} from "./EventBus.mjs";

/**
 * Tool to select shapes
 */
export class SelectionTool implements Tool {
    label: string = 'Auswahl'

    public selectionOptions: SelectionOptions = {
        color: '#43ff6480'
    }

    protected currentEventOrigin = EventHelper.generateOrigin()

    protected shapeStore = new ArrayShapeStore<CanvasShape>()
    protected clientSelectedShapes: string[] = []
    protected selectedShapes: string[] = []
    protected lastCycleSelectedShape?: CanvasShape = undefined
    protected mouseMoveStart: Point2D = { x: 0, y: 0 }
    protected performingDrag = false
    protected accumulativeDragDistance: Point2D = { x: 0, y: 0 }

    constructor() {
        this.attachShapeEventListeners()
    }

    handleMouseDown(x: number, y: number): void {
        this.mouseMoveStart = { x, y }
    }

    handleMouseMove(x: number, y: number, e: MouseEvent): void {
        // mose drag logic:
        // - if mouse is moved more than 5 pixels, consider it a drag
        //  - this prevents accidental drags and allows for a better determination when dragging starts
        // - once dragging mode is entered, the selected shapes will be moved
        // - selection logic is skipped if dragging

        if (e.buttons !== 1) {
            this.performingDrag = false
            this.accumulativeDragDistance = { x: 0, y: 0 }
            return
        }
        const mousePos = { x, y }
        const distance: Point2D = Point2D.subtract(mousePos, this.mouseMoveStart)

        // if the mouse was moved more than 5 pixels, consider it a drag
        // once dragging mode is entered, the selected shapes will be moved
        if (this.performingDrag) {
            this.moveSelectedShapes(distance)
        } else {
            this.accumulativeDragDistance = Point2D.add(this.accumulativeDragDistance, distance)
            this.performingDrag = Point2D.magnitude(this.accumulativeDragDistance) > 5
        }

        this.mouseMoveStart = { x, y }
    }

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

        // Do not perform selection if a drag just ended
        if (this.performingDrag) {
            this.performingDrag = false
            this.accumulativeDragDistance = { x: 0, y: 0 }
            return
        }

        const shapesUnderCursor =
            this.shapeStore.getShapes()
                .reverse()
                .filter(shape => shape.toShape().temporary === false) // do not select temporary shapes
                // .filter(shape => Array.from(this.selectedShapes.values()).findIndex((ids) => ids.findIndex((id) => id == shape.id))) // TODO: remove
                .filter(shape => this.selectedShapes.findIndex(id => id === shape.id) === -1)
                .filter(shape => shape.checkSelection(x, y))
        const selectedShapes = this.clientSelectedShapes

        if (e.altKey) {
            this.handleAltClick(shapesUnderCursor, selectedShapes, e.ctrlKey)
        } else if (e.ctrlKey) {
            this.handleCtrlClick(shapesUnderCursor, selectedShapes)
        } else {
            this.handleSimpleClick(shapesUnderCursor)
        }

        // reset lastCycleSelectedShape if selection gets cancelled
        if (this.clientSelectedShapes.length === 0) {
            this.lastCycleSelectedShape = undefined
        }
    }

    protected handleAltClick(
        shapesUnderCursor: Array<CanvasShape>,
        selectedShapes: Array<string>,
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
                if (selectedShapes.indexOf(clickedShape.id) === -1) {
                    // shape not selected, select it
                    this.selectShape(clickedShape)
                } else {
                    // shape was already selected when Cycle started,
                    // find next shape that is not already selected
                    for (let i = 0; i < shapesUnderCursor.length; i++) {
                        if (selectedShapes.indexOf(shapesUnderCursor[i].id) === -1) {
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
                    if (selectedShapes.indexOf(shapesUnderCursor[i].id) === -1) {
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
                    if (selectedShapes.indexOf(shapesUnderCursor[i].id) === -1) {
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

    protected handleCtrlClick(shapesUnderCursor: Array<CanvasShape>, selectedShapes: Array<string>): void {
        // - ctrl + click -> toggle selection and keep other selections
        //      - if there are multiples shapes on top of each other that are selected, unselect all ?
        //          -> No, just unselect the clicked shape
        
        if (shapesUnderCursor.length === 0) return // nothing happens if no shape is under the cursor
        const clickedShape = shapesUnderCursor[0]

        // check if the clicked shape is already selected, and toggle
        const index = selectedShapes.indexOf(clickedShape.id)
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
        this.clientSelectedShapes.push(shape.id)
        EventHelper.sendShapeSelectedEvent(this.currentEventOrigin, shape.id, this.selectionOptions)
        return this
    }

    protected unselectShape(shape: CanvasShape): this {
        this.clientSelectedShapes = this.clientSelectedShapes.filter(id => id !== shape.id)
        EventHelper.sendShapeDeselectedEvent(this.currentEventOrigin, shape.id)
        return this
    }

    protected resetSelection(): this {
        for (const shapeId of this.clientSelectedShapes) {
            EventHelper.sendShapeDeselectedEvent(this.currentEventOrigin, shapeId)
        }
        this.clientSelectedShapes = []
        return this
    }

    static movedCounter = 0

    protected moveSelectedShapes(distance: Point2D): void {
        for (const shapeId of this.clientSelectedShapes) {
            const canvasShape = this.shapeStore.getShape(shapeId)
            if (!canvasShape) {
                console.warn("Shape not found in store", shapeId)
                continue
            }

            const shape = ShapeHelper.moveShape(canvasShape.toShape(), distance)
            EventHelper.sendShapeChangedEvent(this.currentEventOrigin, shape)
        }
    }

    /**
     * Attach event listeners to the Shape Event Bus
     * Mainly used to synchronize Shapes
     * @protected
     */
    protected attachShapeEventListeners(): void {
        // Ideally this would use a custom Shape not containing the rendering logic
        // discarding information like color, etc.

        SHAPE_EVENT_BUS.addEventListener('ShapeAdded', (event) => {
            this.shapeStore.addShape(convertShape(event.shape))
        })

        SHAPE_EVENT_BUS.addEventListener('ShapeUpdated', (event) => {
            const canvasShape = this.shapeStore.getShape(event.shape.id)
            if (!canvasShape) return
            const shape = canvasShape.toShape()
            Object.assign(shape, event.shape)
            // CanvasShapes are immutable, this replaces the old one
            const newCanvasShape = convertShape(shape)
            newCanvasShape.selectionOptions = canvasShape.selectionOptions
            this.shapeStore.addShape(convertShape(shape))
        })

        SHAPE_EVENT_BUS.addEventListener('ShapeRemoved', (event) => {
            this.shapeStore.removeShape(event.shapeId)
            this.selectedShapes = this.selectedShapes.filter(id => id !== event.shapeId)
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
                this.selectedShapes.push(shape.id)
            } else {
                console.warn("Shape not found for selection event", event)
            }
        })

        SHAPE_EVENT_BUS.addEventListener('ShapeDeselected', (event) => {
            if (event.origin === this.currentEventOrigin) return // do not react to own events

            this.selectedShapes = this.selectedShapes.filter(id => id !== event.shapeId)
        })
    }
}
