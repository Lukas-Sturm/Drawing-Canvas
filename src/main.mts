// Note
// This is a simple SPA implementation
// It uses fetch to load content from the server
// It allows executing scripts in the loaded content
// BUT the script can't use DOMContentLoaded event because it's already fired
// Possibly the loader could wait for all images scripts etc to be fully loaded. Then trigger a custom event, scripts need to be aware of this event
//   -->  This is now implemented
// WebComponents also don't realy work because they need to be defined before the content is loaded, but because the Script is executed after the content is loaded, the WebComponents are not defined yet
//   -->  Scripts that use WebComponents need to listen to the AJAXContentLoaded event and then create the WebComponents and not rely on the provided DOM

// Loaded CSS gets removed if the Node is removed -> Not
import './styles/Style.css'

document.addEventListener('DOMContentLoaded', setupSPA)

async function fetchAndLoad(contentElement: HTMLElement, url: string, options?: RequestInit) {
    const base = { method: 'GET', cache: 'no-cache', headers: { 'X-SPA-Request': 'true' } }
    const data = Object.assign(base, options)
    const response = await fetch(url, data)

    if (response.status === 200) {
        // handle popovers specially
        if (contentElement.hasAttribute('popover')) {
            response.text()
                .then(replaceContent(contentElement, false))
                .then(() => {
                    contentElement.showPopover()
                    setTimeout(() => {
                        contentElement.hidePopover()
                    }, 2000)
                })
        } else {
            response.text()
                .then(text => {
                    document.dispatchEvent(new Event('AJAXPreContentLoading'))
                    // could react to prevent default here
                    return text
                })
                .then((text) => {
                    if (data.method !== 'GET' && response.redirected) {
                        updateHistoryState(response.url)
                    } else if (data.method === 'GET' ) {
                        updateHistoryState(response.url)
                    }
                    return text
                })
                .then(replaceContent(contentElement))
                .then(() => {
                    // replaceContent yields after all scripts are loaded
                    document.dispatchEvent(new Event('AJAXContentLoaded'))
                })
        }
    } else {
        let errorPopover = document.querySelector('#error-pop')
        if (errorPopover instanceof HTMLElement) {

            response.text()
                .then(replaceContent(errorPopover, false))
                .then(() => {
                    errorPopover.showPopover()
                    setTimeout(() => {
                        errorPopover.hidePopover()
                    }, 3000)
                })

        } else {
            console.error('Failed to load content and no error popover found', response)
        }
    }
}

async function setupSPA() {

    console.log('Setting up SPA')

    const contentElement = document.getElementById('content')
    if (!contentElement) {
        console.error('No content element found')
        return
    }

    let initialPath = window.location.pathname
    // internal redirect to home if path is /
    if (initialPath === '/') {
        initialPath = '/home'
    }

    // initial load
    await fetchAndLoad(contentElement, initialPath)

    registerSPAOverides(contentElement)

    window.addEventListener('popstate', async (event) => {
        console.log('SPA back event', event.state)
        if (event.state.url) {
            await fetchAndLoad(contentElement, event.state.url)
        }
    })
}

function registerSPAOverides(contentElement: HTMLElement) {

    console.log('Registering SPA Overrides')

    // registers AJAX handlers for forms
    document.addEventListener('submit', async (event) => {
        const sourceElement = event.target
        if (!eventAjaxRequestEnabled(sourceElement)) {
            return
        }
    
        if (!(sourceElement instanceof HTMLFormElement)) {
            return
        }
    
        event.preventDefault()
    
        const action = sourceElement.getAttribute('action') || ''
        const method = sourceElement.getAttribute('method') || 'GET'
        
        // convert form data to URLSearchParams to send it as application/x-www-form-urlencoded
        // FormData will be send as multipart/form-data
        // actix expects application/x-www-form-urlencoded
        const formData = new URLSearchParams()
        new FormData(sourceElement).forEach((value, key) => {
            formData.append(key, value.toString())
        })

        const target = updateTarget(contentElement, sourceElement)
        await fetchAndLoad(target, action, {
            method: method,
            body: formData
        })
    })
    
    // registers AJAX handlers for anchors
    document.addEventListener('click', async (event) => {
        const sourceElement = event.target
        if (!eventAjaxRequestEnabled(sourceElement)) {
            return
        }
    
        if (sourceElement instanceof HTMLAnchorElement) {
            event.preventDefault()
            
            const target = updateTarget(contentElement, sourceElement)
            const action = sourceElement.getAttribute('href') || ''
            await fetchAndLoad(target, action)
        }
    })
}

function updateTarget(target: HTMLElement, sourceElement: HTMLElement): HTMLElement {
    const alternativeTarget = sourceElement.getAttribute('data-spa-target')
    if (alternativeTarget) {
        const newTarget = document.getElementById(alternativeTarget)
        if (newTarget) {
            return newTarget
        }
    }
    return target
}

function eventAjaxRequestEnabled(element: EventTarget | null): element is HTMLElement {
    return element instanceof HTMLElement && element.getAttribute('data-spa-request') !== null
}

function updateHistoryState(url: string) {
    window.history.pushState({ url }, '', url)
}

// replaces content and properly executes scripts
function replaceContent(contentContainer: HTMLElement, loadScripts: boolean = true): (text: string) => Promise<Promise<void[]>> {
    return (text: string) => {
        return new Promise((resolve) => {
            contentContainer.innerHTML = text // actual HTML5 Spec :)
        
            if (loadScripts) {
                requestAnimationFrame(() => {
    
                    const allScriptsLoaded: Promise<void>[] = []
        
                    // get all script tags and replace them with new script tags
                    // needed, because spec states that script tags should not be executed when inserted via innerHTML
                    contentContainer.querySelectorAll('script').forEach((script) => {
                        const newScript = document.createElement('script')
                        
                        allScriptsLoaded.push(new Promise((resolve) => newScript.addEventListener('load', () => resolve(), { once: true })))
                    
                        // copy all attributes
                        for (let i = 0; i < script.attributes.length; i++) {
                            const attribute = script.attributes[i]
                            newScript.setAttribute(attribute.name, attribute.value)
                        }
        
                        // copy content
                        newScript.text = script.text
        
                        script.replaceWith(newScript)
                    })
        
                    // notify all scripts that they are loaded
                    resolve(Promise.all(allScriptsLoaded))
                })
            } else {
                resolve(Promise.resolve([]))
            }
        })
    }
}