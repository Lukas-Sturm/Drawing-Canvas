import {SelectionManager, Shape, ShapeManager, Tool} from "./types.mjs";

export class SelectionTool implements Tool {
    label: string = 'Auswahl';
    protected lastCycleSelectedShape?: Shape = undefined

    constructor(protected shapeManager: ShapeManager, protected selectionManager: SelectionManager) {}

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
            this.shapeManager.getShapes()
                .reverse()
                .filter(shape => shape.checkSelection(x, y));
        const selectedShapes = this.selectionManager.getSelectedShapes()

        if (e.altKey) {
            this.handleAltClick(shapesUnderCursor, selectedShapes, e.ctrlKey)
        } else if (e.ctrlKey) {
            this.handleCtrlClick(shapesUnderCursor, selectedShapes)
        } else {
            this.handleSimpleClick(shapesUnderCursor)
        }

        // reset lastCycleSelectedShape if selection gets cancelled
        if (this.selectionManager.getSelectedShapes().length === 0) {
            this.lastCycleSelectedShape = undefined
        }

        this.selectionManager.redraw()
    }

    protected handleAltClick(
        shapesUnderCursor: Array<Shape>,
        selectedShapes: Array<Shape>,
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
                    this.selectionManager.selectShape(clickedShape, false)
                } else {
                    // shape was already selected when Cycle started,
                    // find next shape that is not already selected
                    for (let i = 0; i < shapesUnderCursor.length; i++) {
                        if (selectedShapes.indexOf(shapesUnderCursor[i]) === -1) {
                            this.selectionManager.selectShape(shapesUnderCursor[i], false)
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
                        this.selectionManager
                            .resetSelection(false)
                            .selectShape(clickedShape, false)
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
                        this.selectionManager.selectShape(shapesUnderCursor[i], false)
                        break
                    }
                }
            } else {
                // cycle without keeping other selections
                this.selectionManager
                    .resetSelection(false)
                    .selectShape(nextShape, false)
            }
            this.lastCycleSelectedShape = nextShape
        }
    }

    protected handleCtrlClick(shapesUnderCursor: Array<Shape>, selectedShapes: Array<Shape>): void {
        // - ctrl + click -> toggle selection and keep other selections
        //      - if there are multiples shapes on top of each other that are selected, unselect all ?
        //          -> No, just unselect the clicked shape
        
        if (shapesUnderCursor.length === 0) return // nothing happens if no shape is under the cursor
        const clickedShape = shapesUnderCursor[0]

        // check if the clicked shape is already selected, and toggle
        const index = selectedShapes.indexOf(clickedShape)
        if (index !== -1) {
            this.selectionManager.unselectShape(clickedShape, false)
        } else {
            this.selectionManager.selectShape(clickedShape, false)
        }
    }

    protected handleSimpleClick(shapesUnderCursor: Array<Shape>): void {
        // - single click -> select shape unselect all others
        if (shapesUnderCursor.length === 0) {
            this.selectionManager.resetSelection(false)
        } else {
            this.selectionManager
                .resetSelection(false)
                .selectShape(shapesUnderCursor[0], false)
        }
    }
}
