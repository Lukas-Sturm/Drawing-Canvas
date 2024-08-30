import menuStyles from '../styles/Menu.css?inline'

export interface MenuItem {
    render(menu: Menu): HTMLElement
}

class ButtonMenuItem implements MenuItem {
    constructor(
        protected name: string,
        protected callback: (menu: Menu) => void
    ) {
    }

    render(menu: Menu) {
        const button = document.createElement('button')
        button.type = 'button'
        button.textContent = this.name
        button.classList.add('menuItem')
        button.addEventListener('click', () => this.callback(menu))
        return button
    }
}

class SeparatorMenuItem implements MenuItem {
    render(_: Menu) {
        return document.createElement('hr')
    }
}

class RadioOptionMenuItem implements MenuItem {
    constructor(
        readonly name: string,
        protected options: { [key: string]: string },
        protected onChange: (key: string, menu: Menu) => void,
        protected selectedKey?: string,
    ) {
    }

    /**
     * Set the selected key.
     * NEEDS A RE-RENDER TO APPLY.
     * @param key
     */
    setSelectedKey(key: string) {
        this.selectedKey = key
    }

    getSelectedKey() {
        return this.selectedKey
    }

    render(menu: Menu): HTMLElement {
        // Note: consider refactoring to use browser radio buttons, and letting browser handle the state
        // but this is easier to style at least for me :)

        const container = document.createElement('div')

        const name = document.createElement('span')
        name.textContent = this.name
        name.classList.add('menuItem', 'menuText')
        container.appendChild(name)

        Object.entries(this.options).forEach(([key, value]) => {
            const button = document.createElement('button')
            button.type = 'button'
            button.textContent = value
            button.classList.add('menuItem', 'radioMenuItem')
            if (key === this.selectedKey) button.classList.add('selected')

            button.addEventListener('click', () => {
                // remove selected class from all buttons
                container.querySelectorAll('.selected')
                    .forEach(selected => selected.classList.remove('selected'))

                button.classList.add('selected')

                this.selectedKey = key
                this.onChange(key, menu)
            })
            container.appendChild(button)
        })

        return container
    }
}

class Menu implements MenuItem {
    protected readonly clickHandlerOptions = { capture: true }
    protected readonly clickHandler = this.handleMouseClick.bind(this) // required to remove the event listener
    protected readonly mouseDownHandler = this.handleMouseDown.bind(this) // required to remove the event
    protected menuContainer: HTMLElement | undefined
    protected items: MenuItem[] = []

    constructor(
        readonly name: string = 'Menu'
    ) {
    }

    /**
     * Renders the menu as a button with its items as a sub menu
     * @param parentMenu
     */
    render(parentMenu: Menu): HTMLElement {
        const subMenuButton = document.createElement('div')
        subMenuButton.textContent = this.name
        subMenuButton.classList.add('menuItem')
        subMenuButton.classList.add('subMenu')

        const arrow = document.createElement('span')
        arrow.textContent = '>'
        subMenuButton.appendChild(arrow)

        subMenuButton.addEventListener('mouseenter', () => {
            const subMenuContainer = document.createElement('div')
            subMenuContainer.classList.add('menuContainer')
            subMenuContainer.style.top = `${subMenuButton.offsetTop}px`
            subMenuContainer.style.left = `${subMenuButton.offsetLeft + subMenuButton.offsetWidth}px`

            const elements = this.items.map(item => item.render(parentMenu))
            subMenuContainer.append(...elements)
            subMenuButton.appendChild(subMenuContainer)
        })

        // will be called for every sub menu, but that's fine
        subMenuButton.addEventListener('mouseleave', () => {
            const subMenuContainer = subMenuButton.querySelector('.menuContainer')
            if (subMenuContainer) {
                subMenuContainer.remove()
            }
        })

        return subMenuButton
    }

    /**
     * Show the menu at the given position
     * Clears and reconstructs the menu if it is already shown
     * @param x
     * @param y
     */
    show(x: number, y: number) {
        if (this.menuContainer) {
            this.hide()
            this.show(x, y)
            return
        }

        this.menuContainer = document.createElement('div')
        const shadowDom = this.menuContainer.attachShadow({ mode: 'open' })
        shadowDom.adoptedStyleSheets.push(this.buildStyles())

        const elements = this.items.map(item => item.render(this))
        shadowDom.append(...elements)

        document.addEventListener('mousedown', this.mouseDownHandler, this.clickHandlerOptions)
        document.addEventListener('click', this.clickHandler, this.clickHandlerOptions)
        document.addEventListener('contextmenu', this.clickHandler, this.clickHandlerOptions)

        this.menuContainer.style.top = `${y}px`
        this.menuContainer.style.left = `${x}px`

        document.body.appendChild(this.menuContainer)
    }

    /**
     * Removes the menu from the DOM
     */
    hide() {
        if (this.menuContainer) {
            document.addEventListener('mousedown', this.mouseDownHandler, this.clickHandlerOptions)
            document.removeEventListener('click', this.clickHandler, this.clickHandlerOptions)
            document.removeEventListener('contextmenu', this.clickHandler, this.clickHandlerOptions)
            this.menuContainer.remove()
            this.menuContainer = undefined
        }
    }

    /**
     * Adds multiple menu items to the menu
     * @param menuItems
     */
    addItems(...menuItems: MenuItem[]) {
        this.items.push(...menuItems)
    }

    /**
     * Adds a menu item
     * @param menuItem
     * @param position Position of the item in the menu, undefined to append to the end
     */
    addItem(menuItem: MenuItem, position: number | undefined = undefined) {
        if (position === undefined) position = this.items.length // append to the end
        this.items.splice(position, 0, menuItem)
    }

    /**
     * Removes a menu item
     * @param menuItem
     */
    removeItem(menuItem: MenuItem) {
        this.items = this.items.filter(savedItem=> savedItem !== menuItem)
    }

    /**
     * Get the number of items in the menu
     */
    getItemCount() {
        return this.items.length
    }

    protected buildStyles(): CSSStyleSheet {
        const style = new CSSStyleSheet()
        style.replaceSync(menuStyles)
        return style
    }

    protected handleMouseDown(e: MouseEvent) {
        if (e.target === this.menuContainer) return
        this.hide()
    }

    protected handleMouseClick(e: MouseEvent) {
        if (e.target === this.menuContainer) return
        this.hide()

        if (e.type !== 'contextmenu') {
            e.preventDefault()
            e.stopPropagation()
        }
    }
}

export { Menu, ButtonMenuItem, SeparatorMenuItem, RadioOptionMenuItem }