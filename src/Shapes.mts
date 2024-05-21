import {SelectionOptions, Shape, ShapeFactory, ShapeManager} from "./types.mjs"

export class Point2D {
    constructor(readonly x: number, readonly y: number) {}

    static distance(p1: Point2D, p2: Point2D): number {
        return Math.sqrt((p1.x - p2.x) * (p1.x - p2.x) + (p1.y - p2.y) * (p1.y - p2.y))
    }
}

export abstract class AbstractShape {
    private static counter: number = 0
    protected borderColor: string = '#000000'
    protected fillColor: string = '#00000000'

    readonly id: number
    constructor() {
        this.id = AbstractShape.counter++
    }

    setBorderColor(color: string): this {
        this.borderColor = color
        return this
    }

    setFillColor(color: string): this {
        this.fillColor = color
        return this
    }

    getBorderColor(): string {
        return this.borderColor
    }

    getFillColor(): string {
        return this.fillColor
    }
}

abstract class AbstractFactory<T extends Shape> {
    private from?: Point2D
    private tmpTo?: Point2D
    private tmpShape?: T

    protected constructor(readonly shapeManager: ShapeManager) {
    }

    abstract createShape(from: Point2D, to: Point2D): T

    handleMouseDown(x: number, y: number) {
        this.from = new Point2D(x, y)
    }

    handleMouseUp(x: number, y: number) {
        if (!this.from) return
        
        // remove the temp line, if there was one
        if (this.tmpShape) {
            this.shapeManager.removeShapeWithId(this.tmpShape.id, false)
        }
        this.shapeManager.addShape(this.createShape(this.from, new Point2D(x, y)), true)
        this.from = undefined
    }

    handleMouseMove(x: number, y: number) {
        // show temp circle only, if the start point is defined
        if (!this.from) return

        if (!this.tmpTo || (this.tmpTo.x !== x || this.tmpTo.y !== y)) {
            this.tmpTo = new Point2D(x, y)
            if (this.tmpShape) {
                // remove the old temp line, if there was one
                this.shapeManager.removeShapeWithId(this.tmpShape.id, false)
            }
            // adds a new temp line
            this.tmpShape = this.createShape(this.from, new Point2D(x, y))
            this.shapeManager.addShape(this.tmpShape, true)
        }
    }
}

export class Line extends AbstractShape implements Shape {
    protected lengthLineSquared: number
    constructor(readonly from: Point2D, readonly to: Point2D){
        super()
        // precompute
        this.lengthLineSquared = Point2D.distance(this.from, this.to)
    }

    checkSelection(x: number, y: number): boolean {
        // https://www.jeffreythompson.org/collision-detection/line-point.php
        const mouse = new Point2D(x, y)

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

    drawSelection(ctx: CanvasRenderingContext2D, options: SelectionOptions) {
        ctx.beginPath()
        ctx.fillStyle = options.color
        ctx.fillRect(this.from.x - 3, this.from.y - 3, 6, 6)
        ctx.fillRect(this.to.x - 3, this.to.y - 3, 6, 6)
        ctx.stroke()

    }
}

export class LineFactory extends AbstractFactory<Line> implements ShapeFactory {

    public label: string = "Linie"

    constructor(shapeManager: ShapeManager){
        super(shapeManager)
    }

    createShape(from: Point2D, to: Point2D): Line {
        return new Line(from, to)
    }
}

class Circle extends AbstractShape implements Shape {
    constructor(readonly center: Point2D, readonly radius: number){
        super()
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

    drawSelection(ctx: CanvasRenderingContext2D, options: SelectionOptions) {
        ctx.beginPath()
        ctx.strokeStyle = options.color
        ctx.lineWidth = 2
        ctx.arc(this.center.x,this.center.y,this.radius + 4,0,2*Math.PI)
        ctx.stroke()
    }
}

export class CircleFactory extends AbstractFactory<Circle> implements ShapeFactory {
    public label: string = "Kreis"

    constructor(shapeManager: ShapeManager){
        super(shapeManager)
    }

    createShape(from: Point2D, to: Point2D): Circle {
        return new Circle(from, CircleFactory.computeRadius(from, to.x, to.y))
    }

    private static computeRadius(from: Point2D, x: number, y: number): number {
        const xDiff = (from.x - x),
            yDiff = (from.y - y)
        return Math.sqrt(xDiff * xDiff + yDiff * yDiff)
    }
}

export class Rectangle extends AbstractShape implements Shape {
    readonly from: Point2D
    readonly to: Point2D

    constructor(from: Point2D, to: Point2D) {
        super()
        // reorder points to make sure from is top left and to is bottom right
        // makes selection checking easier
        this.from = new Point2D(Math.min(from.x, to.x), Math.min(from.y, to.y))
        this.to = new Point2D(Math.max(from.x, to.x), Math.max(from.y, to.y))
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

    drawSelection(ctx: CanvasRenderingContext2D, options: SelectionOptions) {
        ctx.beginPath()
        ctx.fillStyle = options.color
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

export class RectangleFactory extends AbstractFactory<Rectangle> implements ShapeFactory{
    public label: string = "Rechteck"
    constructor(shapeManager: ShapeManager){
        super(shapeManager)
    }

    createShape(from: Point2D, to: Point2D): Rectangle {
        return new Rectangle(from, to)
    }
}

class Triangle extends AbstractShape implements Shape {
    protected area: number
    constructor(readonly p1: Point2D, readonly p2: Point2D, readonly p3: Point2D) {
        super()
        // precompute area
        this.area = Math.abs((p2.x-p1.x)*(p3.y-p1.y) - (p3.x-p1.x)*(p2.y-p1.y))
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

    drawSelection(ctx: CanvasRenderingContext2D, options: SelectionOptions) {
        ctx.beginPath()
        ctx.fillStyle = options.color
        ctx.fillRect(this.p1.x - 3, this.p1.y - 3, 6, 6)
        ctx.fillRect(this.p2.x - 3, this.p2.y - 3, 6, 6)
        ctx.fillRect(this.p3.x - 3, this.p3.y - 3, 6, 6)
        ctx.stroke()
    }
}

export class TriangleFactory implements ShapeFactory{
    public label: string = "Dreieck"

    private from?: Point2D
    private tmpTo?: Point2D
    private tmpLine?: Line
    private thirdPoint?: Point2D
    private tmpShape?: Triangle

    constructor(readonly shapeManager: ShapeManager) {}

    handleMouseDown(x: number, y: number) {
        if (this.tmpShape && this.from && this.tmpTo) {
            this.shapeManager.removeShapeWithId(this.tmpShape.id, false)
            this.shapeManager.addShape(
                new Triangle(this.from, this.tmpTo, new Point2D(x,y)),
                true
            )
            this.from = undefined
            this.tmpTo = undefined
            this.tmpLine = undefined
            this.thirdPoint = undefined
            this.tmpShape = undefined
        } else {
            this.from = new Point2D(x, y)
        }
    }

    handleMouseUp(x: number, y: number) {
        if (!this.from) return

        // remove the temp line, if there was one
        if (this.tmpLine) {
            this.shapeManager.removeShapeWithId(this.tmpLine.id, false)
            this.tmpLine = undefined
            this.tmpTo = new Point2D(x,y)
            this.thirdPoint = new Point2D(x,y)
            this.tmpShape = new Triangle(this.from, this.tmpTo, this.thirdPoint)
            this.shapeManager.addShape(this.tmpShape, true)
        }
    }

    handleMouseMove(x: number, y: number) {
        // show temp circle only, if the start point is defined
        if (!this.from) return

        if (this.tmpShape && this.tmpTo) { // second point already defined, update temp triangle
            if (!this.thirdPoint || (this.thirdPoint.x !== x || this.thirdPoint.y !== y)) {
                this.thirdPoint = new Point2D(x,y)
                if (this.tmpShape) {
                    // remove the old temp line, if there was one
                    this.shapeManager.removeShapeWithId(this.tmpShape.id, false)
                }
                // adds a new temp triangle
                this.tmpShape = new Triangle(this.from, this.tmpTo, this.thirdPoint)
                this.shapeManager.addShape(this.tmpShape, true)
            }
        } else { // no second point fixed, update tmp line
            if (!this.tmpTo || (this.tmpTo.x !== x || this.tmpTo.y !== y)) {
                this.tmpTo = new Point2D(x,y)
                if (this.tmpLine) {
                    // remove the old temp line, if there was one
                    this.shapeManager.removeShapeWithId(this.tmpLine.id, false)
                }
                // adds a new temp line
                this.tmpLine = new Line(this.from, this.tmpTo)
                this.shapeManager.addShape(this.tmpLine, true)
            }
        }
    }
}
