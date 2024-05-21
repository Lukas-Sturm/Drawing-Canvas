import {ContextMenuItemFactory, SelectionManager as ISelectionManager, Shape, ShapeManager} from "./types.mjs"
import {DrawingCanvas} from "./DrawingCanvas.mjs"
import {ButtonMenuItem, Menu, MenuItem, RadioOptionMenuItem, SeparatorMenuItem} from "./Menu.mjs"

/**
 * SelectionManager that uses a list to store selected shapes
 * Allows for manipulation of selected shapes
 */
export class SelectionManager implements ISelectionManager {
    protected selectedShapes: Shape[] = []

    constructor(protected shapeManager: ShapeManager, protected drawingCanvas: DrawingCanvas) { }

    resetSelection(redraw: boolean = false): this {
        this.selectedShapes = []
        if (redraw) this.redraw()
        return this
    }

    selectShape(shape: Shape, redraw: boolean = false): this {
        this.selectedShapes.push(shape)
        if (redraw) this.redraw()
        return this
    }

    unselectShape(shape: Shape, redraw: boolean): this {
        this.selectedShapes = this.selectedShapes.filter(s => s.id !== shape.id)
        if (redraw) this.redraw()
        return this
    }

    getSelectedShapes(): Shape[] {
        return this.selectedShapes;
    }

    redraw(): this {
        this.drawingCanvas.drawSelection(this.selectedShapes)
        return this
    }

    /**
     * Creates a Context Menu Factory to manipulate the selected shapes
     */
    createContextMenuFactory(): ContextMenuItemFactory {
        const selectAllButton = new ButtonMenuItem('Alle Shapes auswählen', (menu) => {
            this.selectedShapes = this.shapeManager.getShapes()
            this.drawingCanvas.drawSelection(this.selectedShapes)
            menu.hide()
        })

        return () => {
            if (this.selectedShapes.length === 0) return [selectAllButton] // add a select all button for convenience

            const plurals = this.selectedShapes.length > 1 ? 's' : ''
            const countString = this.selectedShapes.length > 1 ? ` (${this.selectedShapes.length}) ` : ''

            const zOrderMenu = this.buildZOrderMenu()
            if (zOrderMenu.length > 0) {
                // add separator if there are z order manipulations
                zOrderMenu.unshift(new SeparatorMenuItem())
            }

            const menuItems: MenuItem[] = [
                new ButtonMenuItem(`${countString}Shape${plurals} löschen!`, (menu) => {
                    this.selectedShapes.forEach(shape => this.shapeManager.removeShape(shape, true))
                    this.resetSelection(true)
                    menu.hide()
                }),
                new SeparatorMenuItem(),
                ...this.buildColorRadioMenu(),
                ...zOrderMenu
            ]
            return menuItems
        }
    }

    /**
     * Builds Menu Items for Z Ordering
     * @protected
     */
    protected buildZOrderMenu(): MenuItem[] {
        if (this.selectedShapes.length === 1) {
            // add z index manipulation
            return [
                new ButtonMenuItem('Ganz nach vorne', (menu) => {
                    this.shapeManager.sendShapeToFront(this.selectedShapes[0], true)
                    menu.hide()
                }),
                new ButtonMenuItem('Ganz nach hinten', (menu) => {
                    this.shapeManager.sendShapeToBack(this.selectedShapes[0], true)
                    menu.hide()
                }),
                new ButtonMenuItem('Nach vorne', (menu) => {
                    this.shapeManager.changeShapeZ(this.selectedShapes[0], 1, true)
                    menu.hide()
                }),
                new ButtonMenuItem('Nach hinten', (menu) => {
                    this.shapeManager.changeShapeZ(this.selectedShapes[0], -1, true)
                    menu.hide()
                })
            ]
        }
        return []
    }

    /**
     * Builds radio Sub Menues for coloring options
     * @protected
     */
    protected buildColorRadioMenu(): MenuItem[] {
        const plurals = this.selectedShapes.length > 1 ? 's' : ''
        const countString = this.selectedShapes.length > 1 ? ` (${this.selectedShapes.length}) ` : ''

        const baseColorOptions = {
            '#EE4A2C': 'Rot',
            '#8CB600': 'Grün',
            '#EFED64': 'Gelb',
            '#189BCC': 'Blau',
            '#000000': 'Schwarz'
        }
        const borderColorOptions = baseColorOptions
        const fillColorOptions =
            Object.assign({}, baseColorOptions, {'#00000000': 'Transparent'})

        const borderColorMenu = new Menu(`${countString}Shape${plurals} Rahmenfarbe`)
        const borderColorRadioMenu = new RadioOptionMenuItem(
            `Rahmenfarbe`,
            borderColorOptions,
            (value, _) => {
                this.selectedShapes.forEach(shape => shape.setBorderColor(value))
                this.shapeManager.redraw()
            }
        )
        borderColorMenu.addItem(borderColorRadioMenu)

        const fillColorMenu = new Menu(`${countString}Shape${plurals} Füllfarbe`)
        const fillColorRadioMenu = new RadioOptionMenuItem(
            `Füllfarbe`,
            fillColorOptions,
            (value, _) => {
                this.selectedShapes.forEach(shape => shape.setFillColor(value))
                this.shapeManager.redraw()
            }
        )
        fillColorMenu.addItem(fillColorRadioMenu)

        if (this.selectedShapes.length === 1) {
            // preselect the colors if only one shape is selected
            borderColorRadioMenu.setSelectedKey(this.selectedShapes[0].getBorderColor())
            fillColorRadioMenu.setSelectedKey(this.selectedShapes[0].getFillColor())
        }

        return [borderColorMenu, fillColorMenu]
    }
}