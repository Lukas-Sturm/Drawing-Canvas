import {CanvasShape, Point2D, SelectionOptions} from "./types.mjs"
import {Circle, Line, Rectangle, Shape, Triangle} from "./Shapes.mjs"

export abstract class AbstractShape {
    protected constructor(
        readonly id: string,
        protected borderColor: string,
        protected fillColor: string
    ) {}
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

export class CanvasLine extends AbstractShape implements CanvasShape {
    readonly from: Point2D
    readonly to: Point2D

    selectionOptions: SelectionOptions | undefined

    protected lengthLineSquared: number

    constructor(shape: Line){
        super(shape.id, shape.borderColor, shape.fillColor)
        this.from = shape.from
        this.to = shape.to

        // precompute
        this.lengthLineSquared = Point2D.distance(this.from, this.to)
    }

    checkSelection(x: number, y: number): boolean {
        // https://www.jeffreythompson.org/collision-detection/line-point.php
        const mouse = { x,y }

        const distanceToFrom = Point2D.distance(this.from, mouse)
        const distanceToTo = Point2D.distance(this.to, mouse)

        return distanceToFrom + distanceToTo <= this.lengthLineSquared + 0.2 &&
            distanceToFrom + distanceToTo >= this.lengthLineSquared - 0.2
    }

    draw(ctx: CanvasRenderingContext2D) {
        ctx.beginPath()
        ctx.strokeStyle = this.borderColor
        ctx.fillStyle = this.fillColor
        ctx.moveTo(this.from.x, this.from.y)
        ctx.lineTo(this.to.x, this.to.y)
        ctx.stroke()
    }

    drawSelection(ctx: CanvasRenderingContext2D) {
        if (this.selectionOptions === undefined) return
        ctx.beginPath()
        ctx.fillStyle = this.selectionOptions.color
        ctx.fillRect(this.from.x - 3, this.from.y - 3, 6, 6)
        ctx.fillRect(this.to.x - 3, this.to.y - 3, 6, 6)
        ctx.stroke()
    }
}

class CanvasCircle extends AbstractShape implements CanvasShape {
    readonly center: Point2D
    readonly radius: number

    selectionOptions: SelectionOptions | undefined

    constructor(shape: Circle){
        super(shape.id, shape.borderColor, shape.fillColor)
        this.center = shape.center
        this.radius = shape.radius
    }

    checkSelection(x: number, y: number): boolean {
        const xDiff = (this.center.x - x),
            yDiff = (this.center.y - y)
        return xDiff * xDiff + yDiff * yDiff <= this.radius * this.radius
    }

    draw(ctx: CanvasRenderingContext2D) {
        ctx.beginPath()
        ctx.strokeStyle = this.borderColor
        ctx.fillStyle = this.fillColor
        ctx.arc(this.center.x,this.center.y,this.radius,0,2*Math.PI)
        ctx.fill()
        ctx.stroke()
    }

    drawSelection(ctx: CanvasRenderingContext2D) {
        if (this.selectionOptions === undefined) return
        ctx.beginPath()
        ctx.strokeStyle = this.selectionOptions.color
        ctx.lineWidth = 2
        ctx.arc(this.center.x,this.center.y,this.radius + 4,0,2*Math.PI)
        ctx.stroke()
    }
}

export class CanvasRectangle extends AbstractShape implements CanvasShape {
    readonly from: Point2D
    readonly to: Point2D

    selectionOptions: SelectionOptions | undefined

    constructor(shape: Rectangle) {
        super(shape.id, shape.borderColor, shape.fillColor)

        const from = shape.from
        const to = shape.to

        // reorder points to make sure from is top left and to is bottom right
        // makes selection checking easier
        this.from = { x: Math.min(from.x, to.x), y: Math.min(from.y, to.y) }
        this.to = { x: Math.max(from.x, to.x), y: Math.max(from.y, to.y) }
    }

    draw(ctx: CanvasRenderingContext2D) {
        ctx.beginPath()
        ctx.strokeStyle = this.borderColor
        ctx.fillStyle = this.fillColor
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

class CanvasTriangle extends AbstractShape implements CanvasShape {
    readonly p1: Point2D
    readonly p2: Point2D
    readonly p3: Point2D

    selectionOptions: SelectionOptions | undefined

    protected area: number
    constructor(shape: Triangle) {
        super(shape.id, shape.borderColor, shape.fillColor)

        this.p1 = shape.p1
        this.p2 = shape.p2
        this.p3 = shape.p3

        // precompute area
        this.area = Math.abs((this.p2.x-this.p1.x)*(this.p3.y-this.p1.y) - (this.p3.x-this.p1.x)*(this.p2.y-this.p1.y))
    }

    checkSelection(x: number, y: number): boolean {
        // https://www.jeffreythompson.org/collision-detection/tri-point.php

        const a = Math.abs((this.p1.x-x)*(this.p2.y-y) - (this.p2.x-x)*(this.p1.y-y))
        const b = Math.abs((this.p2.x-x)*(this.p3.y-y) - (this.p3.x-x)*(this.p2.y-y))
        const c = Math.abs((this.p3.x-x)*(this.p1.y-y) - (this.p1.x-x)*(this.p3.y-y))

        return a + b + c >= this.area && a + b + c <= this.area + 750 // + 750 makes it easier to hit small triangles
    }

    draw(ctx: CanvasRenderingContext2D) {
        ctx.beginPath()
        ctx.strokeStyle = this.borderColor
        ctx.fillStyle = this.fillColor
        ctx.moveTo(this.p1.x, this.p1.y)
        ctx.lineTo(this.p2.x, this.p2.y)
        ctx.lineTo(this.p3.x, this.p3.y)
        ctx.lineTo(this.p1.x, this.p1.y)
        ctx.fill()
        ctx.stroke()
    }

    drawSelection(ctx: CanvasRenderingContext2D) {
        if (this.selectionOptions === undefined) return
        ctx.beginPath()
        ctx.fillStyle = this.selectionOptions.color
        ctx.fillRect(this.p1.x - 3, this.p1.y - 3, 6, 6)
        ctx.fillRect(this.p2.x - 3, this.p2.y - 3, 6, 6)
        ctx.fillRect(this.p3.x - 3, this.p3.y - 3, 6, 6)
        ctx.stroke()
    }
}
