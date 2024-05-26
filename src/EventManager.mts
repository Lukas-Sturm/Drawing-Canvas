import {Shape} from "./Shapes.mjs"
import {SelectionOptions} from "./types.mjs"

export type EventType = 'ShapeAdded'| 'ShapeRemoved' | 'ShapeSelected' | 'ShapeDeselected' | 'ShapeUpdated' | 'ShapeZChanged'

export interface BaseEvent<T extends EventType> {
    type: T
    origin: string // will be used in the future to resolve conflicts (hopefully)
    timestamp: number
}

export interface ShapeAddedEvent extends BaseEvent<'ShapeAdded'> {
    shape: Shape
}

export interface ShapeRemovedEvent extends BaseEvent<'ShapeRemoved'> {
    shapeId: string
}

export interface ShapeSelectedEvent extends BaseEvent<'ShapeSelected'> {
    shapeId: string
    options: SelectionOptions
}

export interface ShapeDeselectedEvent extends BaseEvent<'ShapeDeselected'> {
    shapeId: string
}

export interface ShapeZChanged extends BaseEvent<'ShapeZChanged'> {
    shapeId: string,
    z: number // -INFINITY for send to back, INFINITY for send to front
}

export interface ShapeUpdatedEvent extends BaseEvent<'ShapeUpdated'> {
    shape: Shape
}

type ShapeEventDefinitions = {
    ShapeAdded: ShapeAddedEvent,
    ShapeRemoved: ShapeRemovedEvent,
    ShapeSelected: ShapeSelectedEvent,
    ShapeDeselected: ShapeDeselectedEvent,
    ShapeUpdated: ShapeUpdatedEvent,
    ShapeZChanged: ShapeZChanged
}

export interface IEventBus<T> {
    addEventListener<K extends keyof T>(type: K, listener: (event: T[K]) => void): () => void
    dispatchEvent<K extends keyof T>(type: K, event: T[K]): void
}

// once types and generics work as intended they are super cool :D
type Listener<T, K extends keyof T> = (event: T[K]) => void
type ListenerMap<T> = Partial<{ [ K in keyof T ]: Array<Listener<T, K>> }>

class EventBus<T> implements IEventBus<T> {
    protected listeners: ListenerMap<T> = { }

    addEventListener<K extends keyof T>(
        type: K,
        listener: (event: T[K]) => void
    ): () => void {
        const eventListeners = this.listeners[type] || []
        eventListeners.push(listener)
        this.listeners[type] = eventListeners

        return () => {
            eventListeners.splice(eventListeners.indexOf(listener), 1)
        }
    }

    /**
     * Helper Function to listen to all shape events
     * Needs an event handler for each event type
     * @param listeners Object with event types as keys and listener functions as values
     */
    listenToAllEvents(listeners: { [ K in keyof T ]: (event: T[K]) => void }) {
        for (const type in listeners) {
            this.addEventListener(type, listeners[type])
        }
    }

    dispatchEvent<K extends keyof T>(
        type: K,
        event: T[K]
    ) {
        const eventListeners = this.listeners[type] || []
        eventListeners.forEach(listener => listener(event))
    }
}

// class ShapeEventStore {
//     protected events: BaseEvent<any>[] = []
//     protected undoneEvents: BaseEvent<any>[] = []
//
//     constructor() {
//         const handleEvent = (event: BaseEvent<any>) => {
//
//         }
//
//         SHAPE_EVENT_BUS.addEventListener('ShapeAdded', this.events.push)
//         SHAPE_EVENT_BUS.addEventListener('ShapeRemoved', this.events.push)
//         SHAPE_EVENT_BUS.addEventListener('ShapeSelected', this.events.push)
//         SHAPE_EVENT_BUS.addEventListener('ShapeDeselected', this.events.push)
//         SHAPE_EVENT_BUS.addEventListener('ShapeUpdated', this.events.push)
//         SHAPE_EVENT_BUS.addEventListener('ShapeZChanged', this.events.push)
//     }
//
//     getEvents() {
//         return this.events
//     }
//
//     undoLastEvent() {
//         const event = this.events.pop()
//         if (!event) return
//         this.undoneEvents.push(event)
//     }
//
//     redoLastEvent() {
//         const event = this.undoneEvents.pop()
//         if (!event) return
//         SHAPE_EVENT_BUS.dispatchEvent(event.type, event)
//     }
// }

// Global event bus for the application
export const SHAPE_EVENT_BUS = new EventBus<ShapeEventDefinitions>()
