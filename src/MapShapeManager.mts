import {Shape, ShapeManager} from "./types.mjs";
import {DrawingCanvas} from "./DrawingCanvas.mjs";

/**
 * ShapeManager that uses a Map to store shapes
 * @see ArrayShapeManager for a ShapeManager that uses an Array and allows for faster z index changes
 * @see BTreeShapeManager for a ShapeManager that uses a BTree
 */
export class MapShapeManager implements ShapeManager {
    // Map retains insertion order, can be used for rendering
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map#objects_vs._maps:~:text=a%20Symbol.-,Key%20Order,-The%20keys%20in
    protected shapes: Map<number, Shape> = new Map()

    constructor(protected drawingCanvas: DrawingCanvas) { }

    addShape(shape: Shape, redraw: boolean): this {
        this.shapes.set(shape.id, shape)
        if (redraw) this.redraw()
        return this
    }

    removeShape(shape: Shape, redraw: boolean): this {
        return this.removeShapeWithId(shape.id, redraw)
    }

    removeShapeWithId(id: number, redraw: boolean): this {
        this.shapes.delete(id)
        if (redraw) this.redraw()
        return this
    }

    redraw(): this {
        this.drawingCanvas.draw(Array.from(this.shapes.values()))
        return this
    }

    /**
     * Returns Shapes in order of insertion
     */
    getShapes(): Shape[] {
        return Array.from(this.shapes.values())
    }

    sendShapeToFront(shape: Shape, redraw?: boolean): this {
        this.shapes.delete(shape.id)
        // this works because a map keeps the order of inserts
        this.shapes.set(shape.id, shape)
        if (redraw) this.redraw()
        return this
    }

    sendShapeToBack(shape: Shape, redraw?: boolean): this {
        this.shapes.delete(shape.id)
        // add shape as first element, works because Map keeps order of insertions
        // not sure what that runtime would be, probably O(n)
        this.shapes = new Map([[shape.id, shape], ...Array.from(this.shapes.entries())])
        if (redraw) this.redraw()
        return this
    }

    /**
     * change the Z index of a shape by layers
     * @param shape
     * @param layers layers to move the shape by (positive or negative)
     * @param redraw
     */
    changeShapeZ(shape: Shape, layers: number, redraw?: boolean): this {
        if (layers === 0) return this
        const entries = Array.from(this.shapes.entries())

        // this also works because a map keeps the order of inserts

        const orderedEntries: typeof entries = []
        for (let i = 0; i < entries.length; i++) {
            if (entries[i][1].id === shape.id) {
                if (layers > 0) {
                    // move forward by layers amount
                    if (entries.length <= i + layers) return this.sendShapeToFront(shape, redraw) // can't move forward any further, same as move to front

                    // rebuild order
                    orderedEntries.push(...entries.slice(i + 1, i + layers + 1)) // move forward
                    orderedEntries.push(entries[i]) // insert
                    orderedEntries.push(...entries.slice(i + layers + 1)) // rest
                    break
                } else {
                    // move back by layers amount
                    const poppedElements: typeof entries = []
                    for (let j = 0; j < Math.abs(layers); j++) {
                        const element = orderedEntries.pop()
                        if (!element) return this.sendShapeToBack(shape, redraw) // can't move back any further, same as move to back
                        poppedElements.push(element)
                    }

                    // rebuild order
                    orderedEntries.push(entries[i]) // insert
                    orderedEntries.push(...poppedElements.reverse()) // add popped again
                    orderedEntries.push(...entries.slice(i + 1)) // rest
                    break
                }
            } else {
                // add shapes until we reach the shape
                orderedEntries.push(entries[i])
            }
        }

        this.shapes = new Map(orderedEntries)
        if (redraw) this.redraw()

        return this
    }
}