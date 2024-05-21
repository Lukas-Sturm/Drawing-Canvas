import './Style.css'
import './DrawingCanvas.mts'
import './ToolArea.mts'

import {
    CircleFactory,
    LineFactory, Point2D,
    Rectangle,
    RectangleFactory,
    TriangleFactory
} from "./Shapes.mjs"
import {DrawingCanvas} from "./DrawingCanvas.mjs"
import {ToolArea} from "./ToolArea.mjs"
// import {MapShapeManager} from "./MapShapeManager.mjs"
// import {BTreeShapeManager} from "./BTreeShapeManager.mts"
import {ShapeFactory, Tool} from "./types.mjs"
import {SelectionManager} from "./SelectionManager.mts";
import {SelectionTool} from "./SelectionTool.mjs";
import {ArrayShapeManager} from "./ArrayShapeManager.mjs";

document.addEventListener('DOMContentLoaded', () => {
    // wait for dom to be loaded
    // then wire up the dependencies

    const canvas = document.querySelector('hs-drawing-canvas') as DrawingCanvas
    if (!canvas) throw new Error('Canvas not found')

    // const shapeManager = new MapShapeManager(canvas)
    // const shapeManager = new BTreeShapeManager(canvas)
    const shapeManager = new ArrayShapeManager(canvas)
    const selectionManager = new SelectionManager(shapeManager, canvas)

    const tools: Tool|ShapeFactory[] = [
        // Tools
        new SelectionTool(shapeManager, selectionManager),
        // ShapeFactories
        new LineFactory(shapeManager),
        new CircleFactory(shapeManager),
        new RectangleFactory(shapeManager),
        new TriangleFactory(shapeManager),
    ]

    const toolbar = document.querySelector('hs-tool-area') as ToolArea
    if (!toolbar) throw new Error('Toolbar not found')
    // move attachment to here, not sure how I would do it when creating the HTML-Element,
    // as those are not allowed to have constructor parameters.
    toolbar.setTools(tools)

    // add some shapes to the canvas
    shapeManager.addShape(new Rectangle(new Point2D(10, 10), new Point2D(100, 100)), false)
    shapeManager.addShape(new Rectangle(new Point2D(40, 40), new Point2D(100, 100)), false)
    shapeManager.addShape(new Rectangle(new Point2D(70, 70), new Point2D(100, 100)), true)


    // attach the context menu factories
    canvas.attachContextMenuItemFactory(selectionManager.createContextMenuFactory())
    canvas.attachContextMenuItemFactory(toolbar.createContextMenuFactory(), 1) // low prio show tools last
})
