import {BaseEvent, EventType, SHAPE_EVENT_BUS} from "./EventManager.mjs"
import {Shape} from "./Shapes.mjs"
import {SelectionOptions} from "./types.mjs"

function generateOrigin() {
    return (Math.random() + 1).toString(36).substring(7)
}

function generateBaseEvent<T extends EventType>(origin: string, type: T): BaseEvent<T> {
    return {
        type,
        origin,
        timestamp: Date.now()
    }
}

function sendShapeAddedEvent(origin: string, shape: Shape) {
    const event = generateBaseEvent(origin, 'ShapeAdded')
    SHAPE_EVENT_BUS.dispatchEvent('ShapeAdded', { ...event, shape })
}

function sendShapeRemovedEvent(origin: string, shapeId: string) {
    const event = generateBaseEvent(origin, 'ShapeRemoved')
    SHAPE_EVENT_BUS.dispatchEvent('ShapeRemoved', { ...event, shapeId })
}

function sendShapeSelectedEvent(origin: string, shapeId: string, options: SelectionOptions) {
    const event = generateBaseEvent(origin, 'ShapeSelected')
    SHAPE_EVENT_BUS.dispatchEvent('ShapeSelected', { ...event, shapeId, options })
}

function sendShapeDeselectedEvent(origin: string, shapeId: string) {
    const event = generateBaseEvent(origin, 'ShapeDeselected')
    SHAPE_EVENT_BUS.dispatchEvent('ShapeDeselected', { ...event, shapeId })
}

function sendShapeZChangedEvent(origin: string, shapeId: string, z: number) {
    const event = generateBaseEvent(origin, 'ShapeZChanged')
    SHAPE_EVENT_BUS.dispatchEvent('ShapeZChanged', { ...event, shapeId, z })
}

function sendShapeChangedEvent(origin: string, shape: Shape) {
    const event = generateBaseEvent(origin, 'ShapeUpdated')
    SHAPE_EVENT_BUS.dispatchEvent('ShapeUpdated', { ...event, shape })
}

export const EventHelper = {
    sendShapeRemovedEvent,
    sendShapeAddedEvent,
    sendShapeSelectedEvent,
    sendShapeDeselectedEvent,
    sendShapeZChangedEvent,
    sendShapeChangedEvent,
    generateOrigin
}