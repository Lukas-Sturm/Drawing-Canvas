import {SHAPE_EVENT_BUS} from "./EventBus.mjs";
import {ShapeEvent} from "./ShapeEvents.mjs";
import {CircleFactory, LineFactory, RectangleFactory, TriangleFactory} from "./Shapes.mjs"
import {DrawingCanvas} from "./Components/DrawingCanvas.mjs"
import {ToolArea} from "./Components/ToolArea.mjs"
import {ShapeFactory, Tool} from "./types.mjs"
import {SelectionTool} from "./SelectionTool.mjs"
import {ButtonMenuItem} from "./Components/Menu.mjs"
import {SelectionMenuBuilder} from "./SelectionMenuBuilder.mjs"
import {deserializeEvent, serializeEvent} from "./Utils/EventSerialize.mjs";

import './styles/Style.css'
import './Components/DrawingCanvas.mts'
import './Components/ToolArea.mts'


document.addEventListener('DOMContentLoaded', () => {
    setupDebugEventLog()
    wireCanvas()
})



function wireCanvas() {
    const canvas = document.querySelector('hs-drawing-canvas') as DrawingCanvas
    if (!canvas) throw new Error('Canvas not found')

    const selectionMenuBuilder = new SelectionMenuBuilder()
    const selectionTool = new SelectionTool()

    const tools: Tool|ShapeFactory[] = [
        // Tools
        selectionTool,
        // ShapeFactories
        new LineFactory(),
        new CircleFactory(),
        new RectangleFactory(),
        new TriangleFactory(),
    ]

    const toolbar = document.querySelector('hs-tool-area') as ToolArea
    if (!toolbar) throw new Error('Toolbar not found')
    // move attachment to here, not sure how I would do it when creating the HTML-Element,
    // as those are not allowed to have constructor parameters.
    toolbar.setTools(tools)

    // attach the context menu factories
    canvas.attachContextMenuItemFactory(selectionMenuBuilder.createContextMenuFactory())
    canvas.attachContextMenuItemFactory(toolbar.createContextMenuFactory(), 1) // low prio show tools last
    // QOL makes testing 500ms faster :D
    canvas.attachContextMenuItemFactory(() => [
        new ButtonMenuItem(selectionTool.label, (menu) => {
            toolbar.shadowDOM.querySelector(`#tool-${selectionTool.label}-button`)?.dispatchEvent(new MouseEvent("click"))
            menu.hide()
        })
    ], 1000)
}

// as this is supposed to be a debug tool that will not be permanent, I will not create a separate file and component for it
function setupDebugEventLog() {
    const replayButton = document.querySelector('#logReplayButton') as HTMLButtonElement
    if (!replayButton) throw new Error('Replay Event Button not found')

    const clearButton = document.querySelector('#logClearButton') as HTMLButtonElement
    if (!clearButton) throw new Error('Clear Button not found')

    const optimizeLogButton = document.querySelector('#logOptimizeButton') as HTMLButtonElement
    if (!optimizeLogButton) throw new Error('Optimize Event Log Button not found')

    const eventLogTextArea = document.querySelector('#logTextArea') as HTMLTextAreaElement
    if (!eventLogTextArea) throw new Error('Replay Event TextArea not found')

    let replayingEvents = false

    const eventHandler = (event: ShapeEvent) => {
        if (replayingEvents) return
        eventLogTextArea.value += `${serializeEvent(event)}\n`
    }

    const attachEventLogListeners = () => {
        SHAPE_EVENT_BUS.listenToAllEvents({
            ShapeAdded: eventHandler,
            ShapeDeselected: eventHandler,
            ShapeSelected: eventHandler,
            ShapeRemoved: eventHandler,
            ShapeZChanged: eventHandler,
            ShapeUpdated: eventHandler
        })
    }

    function recreateCanvas() {
        // find canvas and parent, then remove old canvas
        const canvas = document.querySelector('hs-drawing-canvas') as DrawingCanvas
        if (!canvas) throw new Error('Canvas not found')
        const canvasParent = canvas.parentElement
        if (!canvasParent) throw new Error('Canvas Parent not found')
        canvas.remove()

        SHAPE_EVENT_BUS.reset() // clear all previous listeners
        attachEventLogListeners() // reattach event log listeners

        // reapply attributes, uses innerHTML because document.createElement does not allow to set attributes
        // DrawingCanvas uses attributes in constructor, now I know why one should not use attributes in constructor but use them in the mount :)
        // as this event log is just a temporary debug tool, I will not change the DrawingCanvas implementation
        let canvasHtmlTag = '<hs-drawing-canvas '
        for (let attribute of canvas.attributes) {
            canvasHtmlTag += `${attribute.name}="${attribute.value}" `
        }
        canvasParent.innerHTML += `${canvasHtmlTag}></hs-drawing-canvas>`
        wireCanvas()
    }

    attachEventLogListeners()

    replayButton.addEventListener('click', () => {
        const rawEventLog = eventLogTextArea.value
        const rawEvents = rawEventLog.split('\n')

        recreateCanvas()

        replayingEvents = true
        rawEvents.forEach((rawEvent) => {
            if (rawEvent.length === 0) return

            const event = deserializeEvent(rawEvent)
            SHAPE_EVENT_BUS.dispatchEvent(event.type, event) // ts is not complaining so this is fine :)
        })
        replayingEvents = false
    })

    optimizeLogButton.addEventListener('click', () => {
        // reverse events
        // for every delete event
        // do not save any events for that shape

        const rawEventLog = eventLogTextArea.value
        const rawEvents = rawEventLog.split('\n').reverse()
        const resultEvents: ShapeEvent[] = []
        const removedShapes = new Set<string>()

        for (const rawEvent of rawEvents) {
            if (rawEvent.length === 0) continue
            const event = JSON.parse(rawEvent) as ShapeEvent

            if (event.type === 'ShapeRemoved') {
                removedShapes.add(event.shapeId)
                continue
            }

            switch (event.type) {
                // not sure hot to get ts involved here
                // Generic narrowing using control flow is currently not implemented, but I am not 100% sure if this is needed here
                case 'ShapeZChanged':
                case 'ShapeDeselected':
                case 'ShapeSelected':
                    if (removedShapes.has(event.shapeId)) continue
                    break
                case 'ShapeAdded':
                case 'ShapeUpdated':
                    if (removedShapes.has(event.shape.id)) continue
            }

            resultEvents.push(event)
        }

        eventLogTextArea.value = resultEvents.reverse().map((event) => JSON.stringify(event)).join('\n')
        eventLogTextArea.value += '\n'
    })

    clearButton.addEventListener('click', () => {
        eventLogTextArea.value = ''
        replayButton.click() // recreates canvas
    })
}
