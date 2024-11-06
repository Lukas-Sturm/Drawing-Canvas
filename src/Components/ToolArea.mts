import baseAreaStyles from '../styles/ToolArea.css?inline'
import {ContextMenuItemFactory, ShapeFactory} from "../types.mjs"
import {ButtonMenuItem, Menu} from "./Menu.mjs"

export class ToolArea extends HTMLElement {
    readonly shadowDOM: ShadowRoot
    protected selectedTool?: ShapeFactory = undefined
    protected tools: ShapeFactory[] = []
    protected enabled: boolean = true

    constructor() {
        super()
        this.shadowDOM = this.attachShadow({ mode: 'open' })
        this.shadowDOM.adoptedStyleSheets.push(this.buildStyles())
    }

    setTools(tools: ShapeFactory[]) {
        this.shadowDOM.innerHTML = "" // clear the content, allows to set the shapes multiple times
        this.tools = tools

        const buttonElements: HTMLElement[] = []
        tools.forEach(tool => {
            const domSelElement = document.createElement("li")
            domSelElement.innerText = tool.label
            domSelElement.id = `tool-${tool.label}-button`
            this.shadowDOM.appendChild(domSelElement)
            buttonElements.push(domSelElement)

            domSelElement.addEventListener("click", () => {
                if (this.enabled) {
                    // remove class from all elements
                    buttonElements.forEach((element) => element.classList.remove("marked"))
                    // add class to the one that is selected currently
                    domSelElement.classList.add("marked")

                    this.selectedTool = tool
                }
            })
        })
    }

    disableToolSelection() {
        this.enabled = false
        this.selectedTool = undefined
        this.shadowDOM.querySelectorAll("li").forEach((element) => { 
            element.classList.add("disabled")
            element.classList.remove("marked")
        })
    }

    enableToolSelection() {
        this.shadowDOM.querySelectorAll("li").forEach((element) => element.classList.remove("disabled"))
        this.enabled = true
    }

    getSelectedTool(): ShapeFactory | undefined {
        return this.selectedTool
    }

    createContextMenuFactory(): ContextMenuItemFactory {
        return () => {
            const toolMenu = new Menu('Tools')
            toolMenu.addItems(...this.tools.map((tool) => new ButtonMenuItem(tool.label, (menu) => {
                // somewhat hacky way to trigger the click event
                // just wanted to add a context menu builder
                this.shadowDOM.querySelector(`#tool-${tool.label}-button`)?.dispatchEvent(new MouseEvent("click"))
                menu.hide()
            })))
            return [toolMenu]
        }
    }

    protected buildStyles(): CSSStyleSheet {
        const styles = new CSSStyleSheet()
        styles.replaceSync(baseAreaStyles)
        return styles
    }
}

if (!customElements.get('hs-tool-area')) customElements.define('hs-tool-area', ToolArea)
