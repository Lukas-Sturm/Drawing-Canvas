import {Point2D, ShapeFactory} from "./types.mjs"


import {EventHelper} from "./ShapeEvents.mjs";

export type ShapeType = 'Line' | 'Circle' | 'Rectangle' | 'Triangle' | 'Wurst'
export type Shape = Line | Circle | Rectangle | Triangle

export interface ShapeIdentifier {
    id: string
    type: ShapeType
}

export interface BaseShape {
    temporary: boolean
    borderColor: string
    fillColor: string
}

const DefaultShape: BaseShape = {
    borderColor: 'black',
    fillColor: 'transparent',
    temporary: false
}

export interface Line extends BaseShape, ShapeIdentifier {
    type: 'Line'
    from: Point2D
    to: Point2D
}

export interface Circle extends BaseShape, ShapeIdentifier {
    type: 'Circle'
    center: Point2D
    radius: number
}

export interface Rectangle extends BaseShape, ShapeIdentifier {
    type: 'Rectangle'
    from: Point2D
    to: Point2D
}

export interface Triangle extends BaseShape, ShapeIdentifier {
    type: 'Triangle'
    p1: Point2D,
    p2: Point2D,
    p3: Point2D
}

// type IdentifiableBaseShape = BaseShape & ShapeIdentifier
// type AbstractCreateShape<T extends Shape> = { [ K in keyof T as K extends keyof IdentifiableBaseShape ? never : K ]: T[K] }

abstract class AbstractFactory<T extends Shape> {
    private from?: Point2D
    private tmpTo?: Point2D
    private tmpShape?: T

    protected currentEventOrigin = EventHelper.generateOrigin()

    protected constructor() {}

    public abstract createShape(from: Point2D, to: Point2D, temporary: boolean): T

    handleMouseDown(x: number, y: number) {
        this.from = { x, y }
    }

    handleMouseUp(x: number, y: number) {
        if (!this.from) return

        // remove the temp line, if there was one
        if (this.tmpShape) {
            EventHelper.sendShapeRemovedEvent(this.currentEventOrigin, this.tmpShape.id)
        }
        EventHelper.sendShapeAddedEvent(this.currentEventOrigin, this.createShape(this.from, { x, y }, false))
        this.from = undefined
    }

    handleMouseMove(x: number, y: number) {
        // show temp circle only, if the start point is defined
        if (!this.from) return

        if (!this.tmpTo || (this.tmpTo.x !== x || this.tmpTo.y !== y)) {
            this.tmpTo = { x, y }
            if (this.tmpShape) {
                // remove the old temp line, if there was one
                EventHelper.sendShapeRemovedEvent(this.currentEventOrigin, this.tmpShape.id)
            }
            // adds a new temp line
            this.tmpShape = this.createShape(this.from, { x, y }, true)
            EventHelper.sendShapeAddedEvent(this.currentEventOrigin, this.tmpShape)
        }
    }
}

export class LineFactory extends AbstractFactory<Line> implements ShapeFactory {
    static idCount = 0

    public label: string = "Linie"

    constructor() {
        super()
    }

    public createShape(from: Point2D, to: Point2D, temporary: boolean): Line {
        return {
            ...DefaultShape,
            type: 'Line',
            id: 'l-' + this.currentEventOrigin + LineFactory.idCount++,
            to,
            from,
            temporary
        }
    }
}

export class CircleFactory extends AbstractFactory<Circle> implements ShapeFactory {
    static idCount = 0

    public label: string = "Kreis"

    constructor() {
        super()
    }

    public createShape(from: Point2D, to: Point2D, temporary: boolean): Circle {
        return {
            ...DefaultShape,
            type: 'Circle',
            id: 'c-' + this.currentEventOrigin + CircleFactory.idCount++,
            center: from,
            radius: CircleFactory.computeRadius(from, to.x, to.y),
            temporary
        }
    }

    private static computeRadius(from: Point2D, x: number, y: number): number {
        const xDiff = (from.x - x),
            yDiff = (from.y - y)
        return Math.sqrt(xDiff * xDiff + yDiff * yDiff)
    }
}

export class RectangleFactory extends AbstractFactory<Rectangle> implements ShapeFactory{
    static idCount = 0

    public label: string = "Rechteck"

    constructor() {
        super()
    }

    public createShape(from: Point2D, to: Point2D, temporary: boolean): Rectangle {
        return {
            ...DefaultShape,
            type: 'Rectangle',
            id: 'r-' + this.currentEventOrigin + RectangleFactory.idCount++,
            to,
            from,
            temporary
        }
    }
}

export class TriangleFactory implements ShapeFactory{
    static idCount = 0

    public label: string = "Dreieck"

    protected currentEventOrigin = EventHelper.generateOrigin()

    private from?: Point2D
    private tmpTo?: Point2D
    private tmpLine?: Line
    private thirdPoint?: Point2D
    private tmpShape?: Triangle
    private lineFactory = new LineFactory()

    public createShape(p1: Point2D, p2: Point2D, p3: Point2D, temporary: boolean): Triangle {
        return {
            ...DefaultShape,
            type: 'Triangle',
            id: 't-' + this.currentEventOrigin + TriangleFactory.idCount++,
            p1,
            p2,
            p3,
            temporary
        }
    }

    handleMouseDown(x: number, y: number) {
        if (this.tmpShape && this.from && this.tmpTo) {
            EventHelper.sendShapeRemovedEvent(this.currentEventOrigin, this.tmpShape.id)
            EventHelper.sendShapeAddedEvent(this.currentEventOrigin, this.createShape(this.from, this.tmpTo, { x,y }, false))
            this.from = undefined
            this.tmpTo = undefined
            this.tmpLine = undefined
            this.thirdPoint = undefined
            this.tmpShape = undefined
        } else {
            this.from = { x,y }
        }
    }

    handleMouseUp(x: number, y: number) {
        if (!this.from) return

        // remove the temp line, if there was one
        if (this.tmpLine) {
            EventHelper.sendShapeRemovedEvent(this.currentEventOrigin, this.tmpLine.id)
            this.tmpLine = undefined
            this.tmpTo = { x,y }
            this.thirdPoint = { x,y }
            this.tmpShape = this.createShape(this.from, this.tmpTo, this.thirdPoint, true)
            EventHelper.sendShapeAddedEvent(this.currentEventOrigin, this.tmpShape)
        }
    }

    handleMouseMove(x: number, y: number) {
        // show temp circle only, if the start point is defined
        if (!this.from) return

        if (this.tmpShape && this.tmpTo) { // second point already defined, update temp triangle
            if (!this.thirdPoint || (this.thirdPoint.x !== x || this.thirdPoint.y !== y)) {
                this.thirdPoint = { x,y }
                if (this.tmpShape) {
                    // remove the old temp line, if there was one
                    EventHelper.sendShapeRemovedEvent(this.currentEventOrigin, this.tmpShape.id)
                }
                // adds a new temp triangle
                this.tmpShape = this.createShape(this.from, this.tmpTo, this.thirdPoint, true)
                EventHelper.sendShapeAddedEvent(this.currentEventOrigin, this.tmpShape)
            }
        } else { // no second point fixed, update tmp line
            if (!this.tmpTo || (this.tmpTo.x !== x || this.tmpTo.y !== y)) {
                this.tmpTo = { x,y }
                if (this.tmpLine) {
                    // remove the old temp line, if there was one
                    EventHelper.sendShapeRemovedEvent(this.currentEventOrigin, this.tmpLine.id)
                }
                // adds a new temp line
                this.tmpLine = this.lineFactory.createShape(this.from, this.tmpTo, true)
                EventHelper.sendShapeAddedEvent(this.currentEventOrigin, this.tmpLine)
            }
        }
    }
}
