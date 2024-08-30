import {Shape} from "./Shapes.mjs";
import {SelectionOptions} from "./types.mjs";

import {SHAPE_EVENT_BUS} from "./EventBus.mjs";

export type ShapeEventType =
    'ShapeAdded'
    | 'ShapeRemoved'
    | 'ShapeSelected'
    | 'ShapeDeselected'
    | 'ShapeUpdated'
    | 'ShapeZChanged'

export type ShapeEvent =
    ShapeAddedEvent
    | ShapeRemovedEvent
    | ShapeSelectedEvent
    | ShapeDeselectedEvent
    | ShapeUpdatedEvent
    | ShapeZChanged

export interface BaseEvent {
    type: ShapeEventType
    origin: string // will be used in the future to resolve conflicts (hopefully)
    timestamp: number
    external?: true // used to easily identify events that were received from the server
    // external stripped in serialization
}

export interface ShapeAddedEvent extends BaseEvent {
    type: 'ShapeAdded'
    shape: Shape
}

export interface ShapeRemovedEvent extends BaseEvent {
    type: 'ShapeRemoved'
    shapeId: string
}

export interface ShapeSelectedEvent extends BaseEvent {
    type: 'ShapeSelected'
    shapeId: string
    options: SelectionOptions
}

export interface ShapeDeselectedEvent extends BaseEvent {
    type: 'ShapeDeselected'
    shapeId: string
}

export interface ShapeZChanged extends BaseEvent {
    type: 'ShapeZChanged'
    shapeId: string,
    z: number // -INFINITY for send to back, INFINITY for send to front
}

export type PartialShape = Partial<Shape> & { id: string }

export interface ShapeUpdatedEvent extends BaseEvent {
    type: 'ShapeUpdated'
    shape: PartialShape
}

export type ShapeEventDefinitions = {
    ShapeAdded: ShapeAddedEvent,
    ShapeRemoved: ShapeRemovedEvent,
    ShapeSelected: ShapeSelectedEvent,
    ShapeDeselected: ShapeDeselectedEvent,
    ShapeUpdated: ShapeUpdatedEvent,
    ShapeZChanged: ShapeZChanged
}

// ---------------------
// Helper Functions

function generateOrigin() {
    const userid = document.querySelector('script[data-user-id]')?.getAttribute('data-user-id')

    // TODO: consider using time, to avoid collisions

    if (!userid) {  
        console.warn('Canvas served without user id, using random origin')
        return (Math.random() + 1).toString(36).substring(7)
    }

    return userid + (Math.random() + 1).toString(36).substring(7)
}

function sendShapeAddedEvent(origin: string, shape: Shape) {
    SHAPE_EVENT_BUS.dispatchEvent('ShapeAdded', {
        type: 'ShapeAdded',
        origin,
        timestamp: Date.now(),
        shape
    })
}

function sendShapeRemovedEvent(origin: string, shapeId: string) {
    SHAPE_EVENT_BUS.dispatchEvent('ShapeRemoved', {
        type: 'ShapeRemoved',
        origin,
        timestamp: Date.now(),
        shapeId
    })
}

function sendShapeSelectedEvent(origin: string, shapeId: string, options: SelectionOptions) {
    SHAPE_EVENT_BUS.dispatchEvent('ShapeSelected', {
        type: 'ShapeSelected',
        origin,
        timestamp: Date.now(),
        shapeId,
        options
    })
}

function sendShapeDeselectedEvent(origin: string, shapeId: string) {
    SHAPE_EVENT_BUS.dispatchEvent('ShapeDeselected', {
        type: 'ShapeDeselected',
        origin,
        timestamp: Date.now(),
        shapeId
    })
}

function sendShapeZChangedEvent(origin: string, shapeId: string, z: number) {
    SHAPE_EVENT_BUS.dispatchEvent('ShapeZChanged', {
        type: 'ShapeZChanged',
        origin,
        timestamp: Date.now(),
        shapeId,
        z
    })
}

function sendShapeChangedEvent(origin: string, shape: PartialShape) {
    SHAPE_EVENT_BUS.dispatchEvent('ShapeUpdated', {
        type: 'ShapeUpdated',
        origin,
        timestamp: Date.now(),
        shape
    })
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