import {MenuItem} from "./Menu.mjs";

export type SelectionOptions = {
    color: string
}

export type ContextMenuItemFactory = () => Array<MenuItem>

export type ShapeId = number

export interface Shape {
    readonly id: ShapeId

    setBorderColor(color: string): this
    setFillColor(color: string): this
    getBorderColor(): string
    getFillColor(): string

    checkSelection(x: number, y: number): boolean
    draw(ctx: CanvasRenderingContext2D): void
    drawSelection(ctx: CanvasRenderingContext2D, options: SelectionOptions): void
}

export interface ShapeManager {
    getShapes(): Shape[] // in z order
    addShape(shape: Shape, redraw: boolean): this
    removeShape(shape: Shape, redraw: boolean): this
    removeShapeWithId(id: number, redraw: boolean): this
    sendShapeToBack(shape: Shape, redraw: boolean): this
    sendShapeToFront(shape: Shape, redraw: boolean): this
    changeShapeZ(shape: Shape, layers: number, redraw: boolean): this
    redraw(): this
}

export interface SelectionManager {
    getSelectedShapes(): Shape[]
    selectShape(shape: Shape, redraw: boolean): this
    unselectShape(shape: Shape, redraw: boolean): this
    resetSelection(redraw: boolean): this
    redraw(): this
}

export interface Tool {
    label: string
    handleMouseDown(x: number, y: number, e: MouseEvent): void
    handleMouseUp(x: number, y: number, e: MouseEvent): void
    handleMouseMove(x: number, y: number, e: MouseEvent): void
}

export type ShapeFactory = Tool
