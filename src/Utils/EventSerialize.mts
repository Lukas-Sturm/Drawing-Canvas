import {ShapeEvent} from "../ShapeEvents.mjs";

/**
 * Serializes an event to a string
 * Handles spezial values like Infinity
 * @param event
 */
export function serializeEvent(event: ShapeEvent): string {
    switch (event.type) {
        case 'ShapeZChanged':
            const serializableEvent = {
                ...event,
                z: {
                    isInfinity: event.z === Infinity || event.z === -Infinity,
                    value: event.z > 0 ? 1 : -1 // 1 is infinity, -1 is -infinity
                }
            }
            return JSON.stringify(serializableEvent)
        default:
            return JSON.stringify(event)
    }
}

/**
 * Deserializes an event from a string
 * Handles spezial values like Infinity
 * @param event
 */
export function deserializeEvent(event: string): ShapeEvent {
    const parsedEvent = JSON.parse(event) as ShapeEvent
    if (parsedEvent.type === 'ShapeZChanged') {

        // reparse for z
        return JSON.parse(event, (key, value) => {
            if (key === 'z') {
                return value.isInfinity ? Infinity * value.value : value.value
            }
            return value
        })
    }

    return parsedEvent
}