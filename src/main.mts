
// Simple SPA implementation

// All forms and anchors with data-spa-request are fetched using ajax
// if data-spa-target is set, the content is loaded into the element with the id of data-spa-target
//    popovers are a special target, they get shown after the content is loaded and keep visible for a short time
// for a get or a post resulting in a redirect the history state is updated with the new url
// if the browser back button is pressed (and the browser emits a popstate event) the content is simply refetched
// once content is loaded the implementation searches for script tags and replaces them with new script tags to execute them
//    this is because the spec does not execute scipts when inserted via innerHTML
// once all scripts are loaded a custom event is dispatched to notify the scripts that they are loaded

import './styles/Style.css'

// initialisation of the spa "state"
document.addEventListener('DOMContentLoaded', async () =>{
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

    // handle back button
    window.addEventListener('popstate', async (event) => {
        if (event.state.url) {
            await fetchAndLoad(contentElement, event.state.url)
        }
    })
})

/**
 * Fetches the content
 * and replaces the content of the contentElement
 * or displays a popover if the contentElement has the popover attribute
 * if the response is not 200, an error popover is shown
 */
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

/**
 * Registers the AJAX handlers for forms and anchors
 * this is done by listening to the submit and click events
 */
function registerSPAOverides(contentElement: HTMLElement) {
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

/**
 * Checks if the sourceElement has a data-spa-target attribute
 * Returns the target element if it exists, otherwise the sourceElement
 */
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

/**
 * Type guard to check if an element is an HTMLElement and has a data-spa-request attribute
 */
function eventAjaxRequestEnabled(element: EventTarget | null): element is HTMLElement {
    return element instanceof HTMLElement && element.getAttribute('data-spa-request') !== null
}

// updates the history state
function updateHistoryState(url: string) {
    window.history.pushState({ url }, '', url)
}

/**
 * Replaces the content of the contentContainer with the given text
 * if loadScripts is true, all script tags are replaced with new script tags
 * resolves with a promise that resolves when all scripts are loaded
 */
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