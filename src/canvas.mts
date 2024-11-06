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

// Problem: In dev mode vite will reload the modules automatically using a url query to force browser to reevaluate the script
// In production mode the compiled js will only be loaded once and stay loaded even if canvas gets unloaded (navigate to home)
// For this application this is fine, but nice to know how browsers handle js files

// In dev it is easy to unload unused modules by unregistering all listeners. (atleast that should clear all references and let gc collect them)

document.addEventListener('AJAXContentLoaded', () => {
    SHAPE_EVENT_BUS.reset() // clear all previous listeners, free memory form previous canvas

    if (!recreateWebComponents()) {
        // not on canvas page.
        // in dev mode module will be unloaded, but compiled minified js keeps this code loaded
        // so navigating to home will also invoke this code
        return
    }
    requestAnimationFrame(wireCanvas)

    /**
     * Recreates the WebComponents, as they are not defined when the script is executed
     * Only needed when the content is loaded using AJAX
     */
    function recreateWebComponents(): boolean {
        const canvasContainer = document.querySelector('#canvas-container')
        if (!canvasContainer) return false

        // this is a hack, on initial load browser does not know the custom elements
        // only subsequent loads will have the custom elements defined
        // creating the elements in the script guarantees that the elements are defined
        // previous usage of clone and replace was even hackier
        canvasContainer.innerHTML = `
            <hs-tool-area id="mainToolArea"></hs-tool-area>
            <hs-drawing-canvas tool-area="mainToolArea"></hs-drawing-canvas>
            <hs-multi-user-overlay tool-area="mainToolArea"></hs-multi-user-overlay>
        `
        return true
    }

    /**
     * Wires the canvas with the toolbar and the context menu
     */
    function wireCanvas() {
        const canvas = document.querySelector('hs-drawing-canvas') as DrawingCanvas
        if (!canvas) throw new Error('Canvas not found')

        const selectionTool = new SelectionTool()
        selectionTool.selectionOptions.color = textToColor(EventHelper.generateOrigin())

        const selectionMenuBuilder = new SelectionMenuBuilder(selectionTool)

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
})
