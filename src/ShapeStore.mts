import {ID, ShapeStore} from "./types.mjs"

export class ArrayShapeStore<T extends { id: any }> implements ShapeStore<T> {
    protected shapes: T[] = []
    protected shapeLookup: Map<ID<T>, { index: number }> = new Map()

    /**
     * Add a shape to the store
     * Replaces shape if it already exists
     * @param shape
     */
    addShape(shape: T): this {
        // If shape is already in store, replace it
        const cachedLookup = this.shapeLookup.get(shape.id)
        if (cachedLookup) {
            this.shapes[cachedLookup.index] = shape
            return this
        }

        this.shapeLookup.set(shape.id, { index: this.shapes.push(shape) - 1})
        return this
    }

    removeShape(id: ID<T>): this {
        this.shapes = this.shapes.filter(s => s.id !== id)
        this.shapeLookup = new Map(this.shapes.map(({id}, index) => [id, { index }]))
        return this
    }

    getShapes(): T[] {
        return Array.from(this.shapes.values())
    }

    getShape(shapeId: ID<T>): T | undefined {
        const cachedLookup = this.shapeLookup.get(shapeId)
        if (cachedLookup === undefined) return undefined
        return this.shapes[cachedLookup.index]
    }

    sendShapeToFront(shapeId: ID<T>): this {
        const cachedLookup = this.shapeLookup.get(shapeId)
        if (cachedLookup === undefined) throw new Error('Shape not found in lookup')
        const shape = this.shapes[cachedLookup.index]

        this.removeShape(shapeId)
        this.addShape(shape)
        return this
    }

    sendShapeToBack(shapeId: ID<T>): this {
        const cachedLookup = this.shapeLookup.get(shapeId)
        if (cachedLookup === undefined) throw new Error('Shape not found in lookup')
        const shape = this.shapes[cachedLookup.index]

        this.removeShape(shapeId)
        this.shapes.unshift(shape)
        this.shapeLookup.forEach((lookup) => lookup.index += 1)
        this.shapeLookup.set(shape.id, { index: 0 })
        return this
    }

    /**
     * change the Z index of a shape by layers
     * @param shapeId
     * @param layers layers to move the shape by (positive or negative)
     */
    changeShapeZ(shapeId: ID<T>, layers: number): this {
        if (layers === 0) return this

        const cachedLookup = this.shapeLookup.get(shapeId)
        if (cachedLookup === undefined) throw new Error('Shape not found in lookup')

        // const index = this.shapes.indexOf(shape)
        const index = cachedLookup.index

        if (index + layers < 0) return this.sendShapeToBack(shapeId)
        if (index + layers >= this.shapes.length) return this.sendShapeToFront(shapeId)

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

        return this
    }
}