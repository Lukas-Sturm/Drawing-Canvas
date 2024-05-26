import {ContextMenuItemFactory} from "./types.mjs"
import {ButtonMenuItem, Menu, MenuItem, RadioOptionMenuItem, SeparatorMenuItem} from "./Menu.mjs"
import {SHAPE_EVENT_BUS} from "./EventManager.mjs"
import {EventHelper} from "./ShapeEventHelper.mjs"
import {Shape} from "./Shapes.mjs"

/**
 * SelectionMenuBuilder creates a Context Menu Factory to manipulate the selected shapes
 */
export class SelectionMenuBuilder {
    protected allShapes: Map<string, Shape> = new Map()
    protected selectedShapes: Set<string> = new Set()

    protected currentEventOrigin = EventHelper.generateOrigin()

    constructor() {
        this.registerShapeEventListeners()
    }

    /**
     * Creates a Context Menu Factory to manipulate the selected shapes
     */
    createContextMenuFactory(): ContextMenuItemFactory {
        const selectAllButton = new ButtonMenuItem('Alle Shapes auswählen', (menu) => {
            // event listener will mark them as selected automatically
            this.allShapes.forEach((shape) => EventHelper.sendShapeSelectedEvent(this.currentEventOrigin, shape.id, { color: 'red' }) )
            menu.hide()
        })

        return () => {
            if (this.selectedShapes.size === 0) return [selectAllButton] // add a select all button for convenience

            const plurals = this.selectedShapes.size > 1 ? 's' : ''
            const countString = this.selectedShapes.size > 1 ? ` (${this.selectedShapes.size}) ` : ''

            const zOrderMenu = this.buildZOrderMenu()
            if (zOrderMenu.length > 0) {
                // add separator if there are z order manipulations
                zOrderMenu.unshift(new SeparatorMenuItem())
            }

            const menuItems: MenuItem[] = [
                new ButtonMenuItem(`${countString}Shape${plurals} löschen!`, (menu) => {
                    this.selectedShapes.forEach(shape => EventHelper.sendShapeRemovedEvent(this.currentEventOrigin, shape))
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
        if (this.selectedShapes.size === 1) {
            // add z index manipulation

            const firstShapeIter = this.selectedShapes.values().next()
            if (!firstShapeIter.done) {
                const shapeId = firstShapeIter.value

                return [
                    new ButtonMenuItem('Ganz nach vorne', (menu) => {
                        EventHelper.sendShapeZChangedEvent(this.currentEventOrigin, shapeId, Infinity)
                        menu.hide()
                    }),
                    new ButtonMenuItem('Ganz nach hinten', (menu) => {
                        EventHelper.sendShapeZChangedEvent(this.currentEventOrigin, shapeId, -Infinity)
                        menu.hide()
                    }),
                    new ButtonMenuItem('Nach vorne', (menu) => {
                        EventHelper.sendShapeZChangedEvent(this.currentEventOrigin, shapeId, 1)
                        menu.hide()
                    }),
                    new ButtonMenuItem('Nach hinten', (menu) => {
                        EventHelper.sendShapeZChangedEvent(this.currentEventOrigin, shapeId, -1)
                        menu.hide()
                    })
                ]
            }
        }
        return []
    }

    /**
     * Builds radio Sub Menues for coloring options
     * @protected
     */
    protected buildColorRadioMenu(): MenuItem[] {
        const plurals = this.selectedShapes.size > 1 ? 's' : ''
        const countString = this.selectedShapes.size > 1 ? ` (${this.selectedShapes.size}) ` : ''

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
                // this.selectedShapes.forEach(shape => shape.setBorderColor(value))
                this.selectedShapes.forEach(shapeId => {
                    const shape = this.allShapes.get(shapeId)
                    if (!shape) return
                    EventHelper.sendShapeChangedEvent(this.currentEventOrigin, {
                        ...shape,
                        borderColor: value
                    })
                })
            }
        )
        borderColorMenu.addItem(borderColorRadioMenu)

        const fillColorMenu = new Menu(`${countString}Shape${plurals} Füllfarbe`)
        const fillColorRadioMenu = new RadioOptionMenuItem(
            `Füllfarbe`,
            fillColorOptions,
            (value, _) => {
                this.selectedShapes.forEach(shapeId => {
                    const shape = this.allShapes.get(shapeId)
                    if (!shape) return
                    EventHelper.sendShapeChangedEvent(this.currentEventOrigin, {
                        ...shape,
                        fillColor: value
                    })
                })
            }
        )
        fillColorMenu.addItem(fillColorRadioMenu)

        if (this.selectedShapes.size === 1) {
            // preselect the colors if only one shape is selected
            const firstShapeIter = this.selectedShapes.values().next()
            if (!firstShapeIter.done) {
                const shape = this.allShapes.get(firstShapeIter.value)
                if (shape) {
                    borderColorRadioMenu.setSelectedKey(shape.borderColor)
                    fillColorRadioMenu.setSelectedKey(shape.fillColor)
                }
            }
        }

        return [borderColorMenu, fillColorMenu]
    }

    protected registerShapeEventListeners() {
        SHAPE_EVENT_BUS.addEventListener('ShapeSelected', (event) => {
            this.selectedShapes.add(event.shapeId)
        })

        SHAPE_EVENT_BUS.addEventListener('ShapeRemoved', (event) => {
            this.selectedShapes.delete(event.shapeId)
            this.allShapes.delete(event.shapeId)
        })

        SHAPE_EVENT_BUS.addEventListener('ShapeDeselected', (event) => {
            this.selectedShapes.delete(event.shapeId)
        })

        SHAPE_EVENT_BUS.addEventListener('ShapeAdded', (event) => {
            this.allShapes.set(event.shape.id, event.shape)
        })

        SHAPE_EVENT_BUS.addEventListener('ShapeUpdated', (event) => {
            this.allShapes.set(event.shape.id, event.shape)
        })
    }
}