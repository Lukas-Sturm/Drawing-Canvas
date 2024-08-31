import {SHAPE_EVENT_BUS} from "./EventBus.mjs";
import {CircleFactory, LineFactory, RectangleFactory, TriangleFactory} from "./Shapes.mjs"
import {DrawingCanvas} from "./Components/DrawingCanvas.mjs"
import {ToolArea} from "./Components/ToolArea.mjs"
import {ShapeFactory, Tool} from "./types.mjs"
import {SelectionTool} from "./SelectionTool.mjs"
import {ButtonMenuItem} from "./Components/Menu.mjs"
import {SelectionMenuBuilder} from "./SelectionMenuBuilder.mjs"

import "./Components/MultiUser.mjs"
import './Components/DrawingCanvas.mts'
import './Components/ToolArea.mts'
import { textToColor } from "./Utils/General.mts";
import { EventHelper } from "./ShapeEvents.mts";

// Something stops this module from beeing evaluated multiple times, even though the script is loaded multiple times, the below Event will only ever be handeled once
// As far as I am aware, if the script is loaded and executed, it stays loaded and exectued, even if the script tag gets removed
// So this does seem strange that the event is only handeled once
// Maybe this has something to do with this beeing handled as a module
// Only thing I found is that ofc using import only evaluates the imported module once
// Does not matter if run from compiled js source or from vite loading individual modules

// wont complain, but should be further investigated to understand the behavior

document.addEventListener('AJAXContentLoaded', () => {

    SHAPE_EVENT_BUS.reset() // clear all previous listeners, free memory

    recreateWebComponents()
    requestAnimationFrame(wireCanvas)

    /**
     * Recreates the WebComponents, as they are not defined when the script is executed
     * Only needed when the content is loaded using AJAX
     */
    function recreateWebComponents() {
        const canvasContainer = document.querySelector('#canvas-container')
        if (!canvasContainer) throw new Error('Canvas Container not found')

        // this is a 'crude' hack, on initial load browser does not know the custom elements
        // only subsequent loads will have the custom elements defined
        // creating the elements in the script guarantees that the elements are defined
        // previous usage of clone and replace was even hackier
        canvasContainer.innerHTML = `
            <hs-tool-area id="mainToolArea"></hs-tool-area>
            <hs-drawing-canvas tool-area="mainToolArea"></hs-drawing-canvas>
            <hs-multi-user-overlay></hs-multi-user-overlay>
        `
    }

    /**
     * Wires the canvas with the toolbar and the context menu
     */
    function wireCanvas() {
        const canvas = document.querySelector('hs-drawing-canvas') as DrawingCanvas
        if (!canvas) throw new Error('Canvas not found')

        const selectionMenuBuilder = new SelectionMenuBuilder()
        
        const selectionTool = new SelectionTool()
        selectionTool.selectionOptions.color = textToColor(EventHelper.generateOrigin())

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
}, { once: true })
