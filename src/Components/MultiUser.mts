import { SHAPE_EVENT_BUS } from "../EventBus.mts"
import { EventHelper } from "../ShapeEvents.mts"
import { deserializeEvent, serializeEvent } from "../Utils/EventSerialize.mts"
import { textToColor } from "../Utils/General.mts"

export class MultiUserOverlay extends HTMLElement {
    // readonly shadowDOM: ShadowRoot
    readonly userListElement: HTMLUListElement
    protected connectingElement: HTMLDivElement

    protected socket: WebSocket | null = null
    protected eventListenerRemover: () => void = () => {}
    protected users: Map<string, {name: string, sessionId: string, accessLevel: string}> = new Map()

    constructor() {
        super()

        this.userListElement = document.createElement('ul')


        this.connectingElement = document.createElement('div')
        this.connectingElement.appendChild(document.createTextNode('Connecting to server...'))
        const spinner = document.createElement('span')
        spinner.classList.add('loader')
        this.connectingElement.appendChild(spinner)
        this.appendChild(this.connectingElement)
    }

    buildUserList() {
        this.appendChild(document.createElement('hr'))
        this.appendChild(document.createTextNode('Users:'))
        this.appendChild(this.userListElement)

        this.users.forEach((user) => {
            const userElement = document.createElement('li')
            userElement.innerText = user.name
            this.userListElement.appendChild(userElement)
        })
    }

    buildUserAdd() {
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

        addButton.addEventListener('click', () => {
            console.log('Adding user', userEmailInput.value)
            // socket.send(JSON.stringify({ type: 'addUser', email: userEmailInput.value }))
        })

        userAdd.appendChild(userEmailInput)
        userAdd.appendChild(assignAccessLevel)
        userAdd.appendChild(addButton)
        
        this.appendChild(userAdd)
    }

    updateUserList() {
        this.userListElement.innerHTML = ''
        this.users.forEach((user) => {
            const userElement = document.createElement('li')
            userElement.classList.add('user-list-item')
            userElement.style.setProperty('--user-color', textToColor(user.sessionId));
            userElement.innerText = user.name
            this.userListElement.appendChild(userElement)
        })
    }

    /**
     * Connect to the websocket server
     * Called by DOM when CustomElement is added to the DOM
     */
    public connectedCallback() {
        const host = window.location.host
        const canvasPath = window.location.pathname
        console.log("Connecting to", host, canvasPath)

        // opening, then attaching listeners does not seem to be a problem
        // https://websockets.spec.whatwg.org/#feedback-from-the-protocol
        this.socket = new WebSocket(`ws://${host}/ws${canvasPath}`)

        this.socket.onopen = (event) => {
            console.log("Connected to server", event)

            this.socket?.send(JSON.stringify({ type: 'RegisterSession', session: EventHelper.generateOrigin() }))

            this.removeChild(this.connectingElement)

            // now show components
            this.buildUserAdd()
            this.buildUserList()
        }

        this.socket.onclose = (event) => {
            console.log("Disconnected from server", event)
            // this.appendChild(this.connectingElement)
        }

        this.socket.onmessage = (wsMessage) => {
            const rawEvent = JSON.parse(wsMessage.data)

            switch (rawEvent.type) {
                case 'UserJoined':
                    this.users.set(`${rawEvent.userId}-${rawEvent.sessionId}`, {name: rawEvent.username, sessionId: rawEvent.sessionId, accessLevel: rawEvent.accessLevel})
                    console.log('user joined', `${rawEvent.userId}-${rawEvent.sessionId}`, this.users)
                    this.updateUserList()
                    break
                case 'UserLeft':
                    this.users.delete(`${rawEvent.userId}-${rawEvent.sessionId}`)
                    console.log('user left', `${rawEvent.userId}-${rawEvent.sessionId}` ,this.users)
                
                    this.updateUserList()
                    break
                case 'UserAccessLevelChanged':
                    console.log('User Access Level Changed', rawEvent)
                    break
                default:
                    // reparsing is not nice, only refice if performance is an issue
                    const event = deserializeEvent(wsMessage.data)
                    event.external = true
                    // TODO: Typecheck would be nice here
                    SHAPE_EVENT_BUS.dispatchEvent(event.type, event)
            }
        }

        this.socket.onerror = (event) => {
            console.error("Error", event)
        }

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

customElements.define('hs-multi-user-overlay', MultiUserOverlay)