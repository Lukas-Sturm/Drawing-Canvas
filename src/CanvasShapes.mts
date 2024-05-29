import {CanvasShape, Point2D, SelectionOptions} from "./types.mjs"
import {Circle, Line, Rectangle, Shape, Triangle} from "./Shapes.mjs"

/**
 * Contains CanvasShapes only used by Canvas (and selection tool)
 * CanvasShapes are immutable/readonly and wrap around Shapes
 */

export abstract class AbstractShape<T extends Shape> {
    readonly id: string

    protected constructor(
        protected shape: T
    ) {
        this.id = shape.id
    }

    toShape(): T {
        return this.shape
    }
}

// tried using a type map, but couldn't get it to work
type CanvasShapeMap = {
    Line: CanvasLine,
    Circle: CanvasCircle,
    Rectangle: CanvasRectangle,
    Triangle: CanvasTriangle
}

// type CanvasShapeType<T> =
//     T extends 'Circle' ? CanvasCircle :
//         T extends 'Line' ? CanvasLine :
//             never

// TODO: this type is not perfect, adding a new Shape in CanvasShapeMap or CanvasShapeType does not force it to be added to the function.
//  But this already took way to long to figure out. Once I have more time I will look into this :O
// type convertShapeResult<T extends { 'type': any }> = CanvasShapeType<T['type']> extends never ? undefined : CanvasShapeType<T['type']>
type convertShapeResult<T extends { 'type': any }> = T['type'] extends keyof CanvasShapeMap ? CanvasShapeMap[T['type']] : undefined

/**
 * Converts a Shape to a CanvasShape
 * @param shape
 */
export function convertShape<T extends Shape>(shape: T): convertShapeResult<T> {
    switch (shape.type) {
        case 'Line':
            return new CanvasLine(shape) as convertShapeResult<T>
        case 'Circle':
            return new CanvasCircle(shape) as convertShapeResult<T>
        case 'Rectangle':
            return new CanvasRectangle(shape) as convertShapeResult<T>
        case 'Triangle':
            return new CanvasTriangle(shape) as convertShapeResult<T>
        default:
            return undefined as convertShapeResult<T>
    }
}

export class CanvasLine extends AbstractShape<Line> implements CanvasShape {
    type: 'Line' = 'Line'
    selectionOptions: SelectionOptions | undefined

    protected lengthLineSquared: number

    constructor(shape: Line){
        super(shape)

        // precompute
        this.lengthLineSquared = Point2D.distance(this.shape.from, this.shape.to)
    }

    checkSelection(x: number, y: number): boolean {
        // https://www.jeffreythompson.org/collision-detection/line-point.php
        const mouse = { x,y }

        const distanceToFrom = Point2D.distance(this.shape.from, mouse)
        const distanceToTo = Point2D.distance(this.shape.to, mouse)

        return distanceToFrom + distanceToTo <= this.lengthLineSquared + 0.2 &&
            distanceToFrom + distanceToTo >= this.lengthLineSquared - 0.2
    }

    draw(ctx: CanvasRenderingContext2D) {
        ctx.beginPath()
        ctx.strokeStyle = this.shape.borderColor
        ctx.fillStyle = this.shape.fillColor
        ctx.moveTo(this.shape.from.x, this.shape.from.y)
        ctx.lineTo(this.shape.to.x, this.shape.to.y)
        ctx.stroke()
    }

    drawSelection(ctx: CanvasRenderingContext2D) {
        if (this.selectionOptions === undefined) return
        ctx.beginPath()
        ctx.fillStyle = this.selectionOptions.color
        ctx.fillRect(this.shape.from.x - 3, this.shape.from.y - 3, 6, 6)
        ctx.fillRect(this.shape.to.x - 3, this.shape.to.y - 3, 6, 6)
        ctx.stroke()
    }
}

class CanvasCircle extends AbstractShape<Circle> implements CanvasShape {
    type: 'Circle' = 'Circle'
    selectionOptions: SelectionOptions | undefined

    constructor(shape: Circle){
        super(shape)
    }

    checkSelection(x: number, y: number): boolean {
        const xDiff = (this.shape.center.x - x),
            yDiff = (this.shape.center.y - y)
        return xDiff * xDiff + yDiff * yDiff <= this.shape.radius * this.shape.radius
    }

    draw(ctx: CanvasRenderingContext2D) {
        ctx.beginPath()
        ctx.strokeStyle = this.shape.borderColor
        ctx.fillStyle = this.shape.fillColor
        ctx.arc(this.shape.center.x,this.shape.center.y,this.shape.radius,0,2*Math.PI)
        ctx.fill()
        ctx.stroke()
    }

    drawSelection(ctx: CanvasRenderingContext2D) {
        if (this.selectionOptions === undefined) return
        ctx.beginPath()
        ctx.strokeStyle = this.selectionOptions.color
        ctx.lineWidth = 2
        ctx.arc(this.shape.center.x,this.shape.center.y,this.shape.radius + 4,0,2*Math.PI)
        ctx.stroke()
    }
}

export class CanvasRectangle extends AbstractShape<Rectangle> implements CanvasShape {
    type: 'Rectangle' = 'Rectangle'
    selectionOptions: SelectionOptions | undefined

    // custom from and to, makes it easier to check selection
    protected from: Point2D
    protected to: Point2D

    constructor(shape: Rectangle) {
        super(shape)

        // reorder points to make sure from is top left and to is bottom right
        // makes selection checking easier
        const { from, to } = this.shape
        this.from = { x: Math.min(from.x, to.x), y: Math.min(from.y, to.y) }
        this.to = { x: Math.max(from.x, to.x), y: Math.max(from.y, to.y) }
    }

    draw(ctx: CanvasRenderingContext2D) {
        ctx.beginPath()
        ctx.strokeStyle = this.shape.borderColor
        ctx.fillStyle = this.shape.fillColor
        ctx.strokeRect(this.from.x, this.from.y,
            this.to.x - this.from.x, this.to.y - this.from.y)
        ctx.fillRect(this.from.x, this.from.y,
            this.to.x - this.from.x, this.to.y - this.from.y)
        ctx.stroke()
    }

    drawSelection(ctx: CanvasRenderingContext2D) {
        if (this.selectionOptions === undefined) return
        ctx.beginPath()
        ctx.fillStyle = this.selectionOptions.color
        ctx.fillRect(this.from.x - 3, this.from.y - 3, 6, 6)
        ctx.fillRect(this.to.x - 3, this.to.y - 3, 6, 6)
        ctx.fillRect(this.from.x - 3, this.to.y - 3, 6, 6)
        ctx.fillRect(this.to.x - 3, this.from.y - 3, 6, 6)
        ctx.stroke()
    }

    checkSelection(x: number, y: number): boolean {
        return x >= this.from.x && x <= this.to.x && y >= this.from.y && y <= this.to.y
    }
}

class CanvasTriangle extends AbstractShape<Triangle> implements CanvasShape {
    type: 'Triangle' = 'Triangle'
    selectionOptions: SelectionOptions | undefined

    protected area: number
    constructor(shape: Triangle) {
        super(shape)

        // precompute area
        this.area = Math.abs(
            (this.shape.p2.x-this.shape.p1.x)*(this.shape.p3.y-this.shape.p1.y) -
            (this.shape.p3.x-this.shape.p1.x)*(this.shape.p2.y-this.shape.p1.y)
        )
    }

    checkSelection(x: number, y: number): boolean {
        // https://www.jeffreythompson.org/collision-detection/tri-point.php

        const a = Math.abs((this.shape.p1.x-x)*(this.shape.p2.y-y) - (this.shape.p2.x-x)*(this.shape.p1.y-y))
        const b = Math.abs((this.shape.p2.x-x)*(this.shape.p3.y-y) - (this.shape.p3.x-x)*(this.shape.p2.y-y))
        const c = Math.abs((this.shape.p3.x-x)*(this.shape.p1.y-y) - (this.shape.p1.x-x)*(this.shape.p3.y-y))

        return a + b + c >= this.area && a + b + c <= this.area + 750 // + 750 makes it easier to hit small triangles
    }

    draw(ctx: CanvasRenderingContext2D) {
        ctx.beginPath()
        ctx.strokeStyle = this.shape.borderColor
        ctx.fillStyle = this.shape.fillColor
        ctx.moveTo(this.shape.p1.x, this.shape.p1.y)
        ctx.lineTo(this.shape.p2.x, this.shape.p2.y)
        ctx.lineTo(this.shape.p3.x, this.shape.p3.y)
        ctx.lineTo(this.shape.p1.x, this.shape.p1.y)
        ctx.fill()
        ctx.stroke()
    }

    drawSelection(ctx: CanvasRenderingContext2D) {
        if (this.selectionOptions === undefined) return
        ctx.beginPath()
        ctx.fillStyle = this.selectionOptions.color
        ctx.fillRect(this.shape.p1.x - 3, this.shape.p1.y - 3, 6, 6)
        ctx.fillRect(this.shape.p2.x - 3, this.shape.p2.y - 3, 6, 6)
        ctx.fillRect(this.shape.p3.x - 3, this.shape.p3.y - 3, 6, 6)
        ctx.stroke()
    }
}
