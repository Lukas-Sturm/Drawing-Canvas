import { SHAPE_EVENT_BUS } from "../EventBus.mts"
import { EventHelper } from "../ShapeEvents.mts"
import { deserializeEvent, serializeEvent } from "../Utils/EventSerialize.mts"
import { textToColor } from "../Utils/General.mts"
import { ToolArea } from "./ToolArea.mts"

/*
This component is used as the gateway to the websocket server
It relays all events to the server and dispatches all events send from the server
Received events are marked as .external to identify them as such

The previously introduced Origin is used as a session identifier
The same user can open multiple sessions
Access Level enforced by the server and by disabling the Toolarea and Moderation tools
*/

enum AccessLevel {
    Owner,
    Moderate,
    Voice,
    Write,
    Read,
}

enum DrawingCanvasState {
    Active,
    Moderated,
}

type CanvasUser = {
    name: string,
    userId: string,
    sessionId: string,
    accessLevel: string
}

export class MultiUserOverlay extends HTMLElement {
    protected readonly userListElement: HTMLUListElement
    protected readonly connectingElement: HTMLDivElement
    protected readonly assignCanvasState: HTMLSelectElement
    protected readonly toolArea: ToolArea
    protected readonly moderationContainerElement: HTMLDivElement
    protected moderationElement: HTMLDivElement | null = null // lazy loaded


    protected readonly origin: string = EventHelper.generateOrigin()
    protected readonly userId: string
    protected accessLevel: AccessLevel
    protected canvasState: DrawingCanvasState = DrawingCanvasState.Active

    protected socket: WebSocket | null = null
    protected eventListenerRemover: () => void = () => {}
    protected users: Map<string, CanvasUser> = new Map()

    constructor() {
        super()

        const userId = document.querySelector('#canvas-container[data-user-id]')?.getAttribute('data-user-id')
        if (!userId) {
            throw new Error('Canvas served without user id')
        }
        this.userId = userId
        console.log('User ID:', userId)

        const accessLevel = document.querySelector('#canvas-container[data-user-access-level]')?.getAttribute('data-user-access-level')
        if (!accessLevel) {
            throw new Error('Canvas served without user access level')
        }
        this.accessLevel = AccessLevel[accessLevel as keyof typeof AccessLevel]
        if (this.accessLevel === undefined) {
            throw new Error('Invalid access level')
        }
        console.log('Access Level:', AccessLevel[accessLevel as keyof typeof AccessLevel])

        if (this.hasAttribute('tool-area')) {
            const toolAreaId = this.getAttribute('tool-area')
            if (!toolAreaId) throw new Error('Tool Area ID is required')
            this.toolArea = document.getElementById(toolAreaId) as ToolArea
            if (!this.toolArea) throw new Error('Tool Area not found')
        } else {
            throw new Error('Tool Area is required, add tool-area attribute pointing to Area ID to the element')
        }

        this.userListElement = document.createElement('ul')
        this.assignCanvasState = document.createElement('select')
        this.connectingElement = document.createElement('div')
        this.moderationContainerElement = document.createElement('div')
    }

    buildLoadingSpinner() {
        this.connectingElement.appendChild(document.createTextNode('Verbindung wird aufgebaut...'))
        const spinner = document.createElement('span')
        spinner.classList.add('loader')
        this.connectingElement.appendChild(spinner)
    }

    buildUserList() {
        const userListTitle = document.createElement('h3')
        userListTitle.innerText = 'Aktive Nutzer:'
        this.appendChild(userListTitle)

        this.appendChild(this.userListElement)

        this.users.forEach((user) => {
            const userElement = document.createElement('li')
            userElement.innerText = user.name
            this.userListElement.appendChild(userElement)
        })
    }

    buildModeration() {
        if (this.moderationElement) {
            this.moderationContainerElement.appendChild(this.moderationElement)
            return 
        }

        const moderationElement = document.createElement('div')
        moderationElement.appendChild(this.buildCanvasStateChangeForm())
        moderationElement.appendChild(document.createElement('hr'))
        moderationElement.appendChild(this.buildUserAddForm())
        moderationElement.appendChild(document.createElement('hr'))
    
        this.moderationElement = moderationElement
        this.buildModeration()
    }

    buildCanvasStateChangeForm() {
        const canvasModeration = document.createElement('form')
        canvasModeration.attributes.setNamedItem(document.createAttribute('data-spa-request'))
        const targetAttribute = document.createAttribute('data-spa-target')
        targetAttribute.value = 'info-pop'
        canvasModeration.attributes.setNamedItem(targetAttribute)
        canvasModeration.method = 'POST'
        canvasModeration.action = `${window.location.pathname}/update`

        this.assignCanvasState.name = 'state'
        const states = ['Moderated', 'Active']
        states.forEach((state) => {
            const option = document.createElement('option')
            option.id = 'canvas-state' + state
            option.value = state
            option.innerText = state
            option.selected = state === DrawingCanvasState[this.canvasState]
            this.assignCanvasState.appendChild(option)
        })

        const addButton = document.createElement('button')
        addButton.type = 'submit'
        addButton.innerText = 'Update Canvas State'

        canvasModeration.appendChild(this.assignCanvasState)
        canvasModeration.appendChild(addButton)
        
        return canvasModeration
    }

    buildUserAddForm() {
        const userAdd = document.createElement('form')
        userAdd.attributes.setNamedItem(document.createAttribute('data-spa-request'))
        const targetAttribute = document.createAttribute('data-spa-target')
        targetAttribute.value = 'info-pop'
        userAdd.attributes.setNamedItem(targetAttribute)
        userAdd.method = 'POST'

        const userEmailInput = document.createElement('input')
        userEmailInput.type = 'text'
        userEmailInput.name = 'username_email'
        userEmailInput.placeholder = 'Email or Username'

        const assignAccessLevel = document.createElement('select')
        assignAccessLevel.name = 'access_level'
        const accessLevels = ['Read', 'Write', 'Moderate', 'Voice']
        accessLevels.forEach((level) => {
            const option = document.createElement('option')
            option.value = level
            option.innerText = level
            assignAccessLevel.appendChild(option)
        })

        const addButton = document.createElement('button')
        addButton.type = 'submit'
        addButton.innerText = 'Add User'

        userAdd.appendChild(userEmailInput)
        userAdd.appendChild(assignAccessLevel)
        userAdd.appendChild(addButton)
        
        return userAdd
    }

    updateCanvasState(state: DrawingCanvasState) {
        for (const option of this.assignCanvasState.options) {
            option.selected = option.value === DrawingCanvasState[state]
        }

        this.canvasState = state
        
        if (state === DrawingCanvasState.Moderated) {
            document.querySelector('#canvas-title-lock')?.classList.remove('hidden')
        } else {
            document.querySelector('#canvas-title-lock')?.classList.add('hidden')
        }

        // reevaluate access level for state change
        this.updateAccessLevel(this.accessLevel)
    }

    updateAccessLevel(accessLevel: AccessLevel) {
        console.log('Access Level Changed', AccessLevel[accessLevel])
        this.accessLevel = accessLevel
        
        if (accessLevel === AccessLevel.Read || 
            ( accessLevel === AccessLevel.Write && this.canvasState === DrawingCanvasState.Moderated)
        ) {
            this.toolArea.disableToolSelection()
        } else {
            this.toolArea.enableToolSelection()
        }

        if (accessLevel === AccessLevel.Owner || accessLevel === AccessLevel.Moderate) {
            this.buildModeration()
        } else {
            if (this.moderationElement) this.moderationContainerElement.removeChild(this.moderationElement)
        }
    }

    updateUserList() {
        this.userListElement.innerHTML = ''
        this.users.forEach((user) => {
            const userElement = document.createElement('li')
            userElement.classList.add('user-list-item')
            userElement.style.setProperty('--user-color', textToColor(user.sessionId));
            userElement.innerText = `${user.name} (${user.accessLevel})`
            if (user.userId === this.userId && user.sessionId === this.origin) {
                userElement.innerText += ' <- Du'
            }
            this.userListElement.appendChild(userElement)
        })
    }

    /**
     * Connect to the websocket server
     * Called by DOM when CustomElement is added to the DOM
     */
    public connectedCallback() {
        this.buildLoadingSpinner()
        this.appendChild(this.connectingElement)
        this.appendChild(this.moderationContainerElement)

        const host = window.location.host
        const canvasPath = window.location.pathname
        console.log("Connecting to", host, canvasPath)

        // opening, then attaching listeners does not seem to be a problem
        // https://websockets.spec.whatwg.org/#feedback-from-the-protocol
        this.socket = new WebSocket(`ws://${host}/ws${canvasPath}`)

        this.socket.onopen = () => {
            console.log("Connected to server")

            // send inital message containing session
            // this is only needed to adhere to required url schema, and because Browser Websocket implementation is limited
            this.socket?.send(JSON.stringify({ type: 'RegisterSession', session: EventHelper.generateOrigin() }))

            this.removeChild(this.connectingElement)

            // show controls based on initial access level
            this.updateAccessLevel(this.accessLevel)

            this.buildUserList()
        }

        this.socket.onclose = () => {
            this.replaceChildren(
                document.createTextNode('Verbindung zum Server verloren, bitte neu laden'),
                document.createElement('br'),
                document.createTextNode('Desynchronisation kann auftreten')
            )
        }

        this.socket.onmessage = (wsMessage) => {
            const rawEvent = JSON.parse(wsMessage.data)

            switch (rawEvent.type) {
                case 'UserJoined':
                    console.log('User Joined', rawEvent)
                    this.users.set(`${rawEvent.userId}-${rawEvent.sessionId}`, {
                        name: rawEvent.username,
                        userId: rawEvent.userId,
                        sessionId: rawEvent.sessionId,
                        accessLevel: rawEvent.accessLevel
                    })
                    this.updateUserList()
                    break
                case 'UserLeft':
                    this.users.delete(`${rawEvent.userId}-${rawEvent.sessionId}`)
                    this.updateUserList()
                    break
                case 'CanvasStateChanged':
                    console.log('Canvas State Changed', rawEvent)
                    const state = DrawingCanvasState[rawEvent.state as keyof typeof DrawingCanvasState]
                    if (state === undefined) {
                        console.error('Invalid canvas state', rawEvent)
                        return
                    }
                    this.updateCanvasState(state)
                    break;
                case 'UserAccessLevelChanged':
                    console.log('User Access Level Changed', rawEvent)
                    const accessLevel = AccessLevel[rawEvent.accessLevel as keyof typeof AccessLevel]
                    if (accessLevel === undefined) {
                        console.error('Invalid access level', rawEvent)
                        return
                    }

                    this.users.forEach((user) => {
                        if (user.userId === rawEvent.userId) {
                            user.accessLevel = rawEvent.accessLevel
                        }
                    })

                    if (rawEvent.userId === this.userId) {
                        this.updateAccessLevel(accessLevel)
                    }

                    this.updateUserList()
                    break
                default:
                    // reparsing is not nice, only revise if performance is an issue
                    const event = deserializeEvent(wsMessage.data)
                    event.external = true
                    // FIXME: Typecheck would be nice here
                    SHAPE_EVENT_BUS.dispatchEvent(event.type, event)
            }
        }

        this.socket.onerror = (event) => {
            console.error("Socket Error", event)
        }

        // Relay every event to the server
        this.eventListenerRemover = SHAPE_EVENT_BUS.listenToAllEvents({
            ShapeAdded: (event) => {
                if (event.external) return
                this.socket?.send(serializeEvent(event))
            },
            ShapeRemoved: (event) => {
                if (event.external) return
                this.socket?.send(serializeEvent(event))
            },
            ShapeUpdated: (event) => {
                if (event.external) return
                this.socket?.send(serializeEvent(event))
            },
            ShapeSelected: (event) => {
                if (event.external) return
                this.socket?.send(serializeEvent(event))
            },
            ShapeDeselected: (event) => {
                if (event.external) return
                this.socket?.send(serializeEvent(event))
            },
            ShapeZChanged: (event) => {
                if (event.external) return
                this.socket?.send(serializeEvent(event))
            }
        })
    }

    /**
     * Disconnect from the websocket server
     * Called by DOM when CustomElement is removed from the DOM
     */
    public disconnectedCallback() {
        console.log("Disconnected")
        if (this.socket) {
            this.socket.close()
        }
    }
}

if (!customElements.get('hs-multi-user-overlay')) customElements.define('hs-multi-user-overlay', MultiUserOverlay)