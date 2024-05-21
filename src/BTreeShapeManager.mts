import {Shape, ShapeManager} from "./types.mjs";
import {DrawingCanvas} from "./DrawingCanvas.mjs";
// import { BTree } from "@tylerbu/sorted-btree-es6";

// This can't harness the power of a balanced Tree in this situation.
// Just using a BTree would not result in a major performance improvement compared to the array based ordering.
// The BTree shines when combined with caching, to reduce the amount of required drawing operations.
// Already drawn shapes can be stored in the BTree and only redrawn when they or the order of the btree changes.
// But the whole project structure I have currently setup does not allow that easily.
// Canvas would need to become the ShapeManager again then it would be easier to achieve.
// It also needs a custom implementation of the BTree to attach drawn caches to the nodes.

export class BTreeShapeManager implements ShapeManager {
    // protected shapes: BTree<number, Shape> = new BTree()

    constructor(protected drawingCanvas: DrawingCanvas) { }

    addShape(_: Shape, redraw?: boolean): this {
        // this.shapes.set(shape.id, shape)
        if (redraw) this.redraw()
        return this
    }

    removeShape(shape: Shape, redraw?: boolean): this {
        return this.removeShapeWithId(shape.id, redraw)
    }

    removeShapeWithId(_: number, redraw?: boolean): this {
        // this.shapes.delete(id)
        if (redraw) this.redraw()
        return this
    }

    redraw(): this {
        // this.drawingCanvas.draw(Array.from(this.shapes.values()))
        return this
    }

    /**
     * Returns Shapes in z order
     */
    getShapes(): Shape[] {
        // should ne a copy, or CoW
        // return Array.from(this.shapes.values())
        return []
    }

    sendShapeToFront(_: Shape): this {
        return this
    }

    sendShapeToBack(_: Shape): this {
        return this
    }

    /**
     * change the Z index of a shape by layers
     * @param _
     * @param __ layers to move the shape by (positive or negative)
     */
    changeShapeZ(_: Shape, __: number): this {
        return this
    }
}