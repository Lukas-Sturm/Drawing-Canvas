import {Shape, ShapeManager} from "./types.mjs";
import {DrawingCanvas} from "./DrawingCanvas.mjs";

/**
 * ShapeManager that uses an Array to store shapes
 * @see MapShapeManager for a ShapeManager that uses a Map
 * @see BTreeShapeManager for a ShapeManager that uses a BTree
 */
export class ArrayShapeManager implements ShapeManager {
    protected shapes: Shape[] = []
    protected shapeLookup: Map<number, { index: number }> = new Map()

    constructor(protected drawingCanvas: DrawingCanvas) { }

    addShape(shape: Shape, redraw: boolean): this {
        this.shapeLookup.set(shape.id, { index: this.shapes.push(shape) - 1})
        if (redraw) this.drawingCanvas.draw(this.shapes)
        return this
    }

    removeShape(shape: Shape, redraw: boolean): this {
        return this.removeShapeWithId(shape.id, redraw)
    }

    removeShapeWithId(id: number, redraw: boolean): this {
        this.shapeLookup.delete(id)
        this.shapes = this.shapes.filter(s => s.id !== id)
        if (redraw) this.drawingCanvas.draw(this.shapes)
        return this
    }

    redraw(): this {
        this.drawingCanvas.draw(this.shapes)
        return this
    }

    /**
     * Returns Shapes in order of z index
     */
    getShapes(): Shape[] {
        return Array.from(this.shapes.values())
    }

    sendShapeToFront(shape: Shape, redraw: boolean): this {
        this.removeShape(shape, false)
        this.addShape(shape, false)
        if (redraw) this.redraw()
        return this
    }

    sendShapeToBack(shape: Shape, redraw: boolean): this {
        this.removeShape(shape, false)
        this.shapes.unshift(shape)
        this.shapeLookup.forEach((lookup) => lookup.index += 1)
        this.shapeLookup.set(shape.id, { index: 0 })
        if (redraw) this.redraw()
        return this
    }

    /**
     * change the Z index of a shape by layers
     * @param shape
     * @param layers layers to move the shape by (positive or negative)
     * @param redraw
     */
    changeShapeZ(shape: Shape, layers: number, redraw: boolean): this {
        if (layers === 0) return this

        const cachedLookup = this.shapeLookup.get(shape.id)
        if (cachedLookup === undefined) throw new Error('Shape not found in lookup')

        // const index = this.shapes.indexOf(shape)
        const index = cachedLookup.index
        if (index === undefined) return this

        if (index + layers < 0) return this.sendShapeToBack(shape, redraw)
        if (index + layers >= this.shapes.length) return this.sendShapeToFront(shape, redraw)

        const shapeToMove = this.shapes[index]
        const direction = layers > 0 ? 1 : -1
        // shift shapes in array by layers amount in direction
        for (let i = 0; i < Math.abs(layers); i++) {
            const offset = index + i * direction
            const shapeToShift = this.shapes[offset + direction]
            this.shapes[offset] = shapeToShift

            // update lookup
            const cachedLookup = this.shapeLookup.get(shapeToShift.id)
            if (cachedLookup === undefined) throw new Error('Shape not found in lookup')
            cachedLookup.index = offset
        }
        // move shape to new position
        this.shapes[index + layers] = shapeToMove
        // update lookup
        cachedLookup.index = index + layers

        if (redraw) this.redraw()

        return this
    }
}