import {MenuItem} from "./Menu.mjs"

export interface Point2D {
    readonly x: number
    readonly y: number
}

export class Point2D {
    private constructor() {}

    static distance(p1: Point2D, p2: Point2D): number {
        return Math.sqrt((p1.x - p2.x) * (p1.x - p2.x) + (p1.y - p2.y) * (p1.y - p2.y))
    }
}

export type SelectionOptions = {
    color: string
}

export type ContextMenuItemFactory = () => Array<MenuItem>

export type ShapeId = string

export interface CanvasShape {
    readonly id: ShapeId

    selectionOptions: SelectionOptions | undefined

    draw(ctx: CanvasRenderingContext2D): void
    drawSelection(ctx: CanvasRenderingContext2D): void
    checkSelection(x: number, y: number): boolean // TODO: move to SelectableShape at some point to fully embrace event sourcing
}

export interface SelectableShape {
    readonly id: ShapeId

    checkSelection(x: number, y: number): boolean
}

export interface SelectionManager {
    getSelectedShapeIds(): string[]
    selectShape(shapeId: string, redraw: boolean): this
    unselectShape(shapeId: string, redraw: boolean): this
    resetSelection(redraw: boolean): this
    // redraw(): this
}

export interface Tool {
    label: string
    handleMouseDown(x: number, y: number, e: MouseEvent): void
    handleMouseUp(x: number, y: number, e: MouseEvent): void
    handleMouseMove(x: number, y: number, e: MouseEvent): void
}

export type ShapeFactory = Tool

export type ID<T extends { id: any }> = T['id']

export interface ShapeStore<T extends { id: any }> {
    addShape(shape: T): this
    removeShape(id: ID<T>): this
    getShapes(): T[]
    getShape(shapeId: ID<T>): T | undefined
    sendShapeToFront(shapeId: ID<T>): this
    sendShapeToBack(shapeId: ID<T>): this
    changeShapeZ(shapeId: ID<T>, layers: number): this
}