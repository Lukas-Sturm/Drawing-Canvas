import {ShapeEventDefinitions} from "./ShapeEvents.mjs";

/**
 * Simple Event Bus
 * Exports a global event bus for the application
 * All components and systems should use this event bus to communicate
 */

export interface EventBus<T> {
    addEventListener<K extends keyof T>(type: K, listener: (event: T[K]) => void): () => void
    dispatchEvent<K extends keyof T>(type: K, event: T[K]): void
    reset(): void
}

// once types and generics work as intended they are super cool :D
type Listener<T, K extends keyof T> = (event: T[K]) => void
type ListenerMap<T> = Partial<{ [ K in keyof T ]: Array<Listener<T, K>> }>

class ClientOnlyEventBus<T> implements EventBus<T> {
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

    reset() {
        this.listeners = {}
    }
}

// Global event bus for the application
export const SHAPE_EVENT_BUS = new ClientOnlyEventBus<ShapeEventDefinitions>()


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
