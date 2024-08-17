
const DEV = true;
const ADD_DEV = DEV ? '?dev' : '';

// Note
// This is a simple SPA implementation
// It uses fetch to load content from the server
// It allows executing scripts in the loaded content
// BUT the script can't use DOMContentLoaded event because it's already fired
// Possibly the loader could wait for all images scripts etc to be fully loaded. Then trigger a custom event, scripts need to be aware of this event
//   -->  This is now implemented
// WebComponents also don't realy work because they need to be defined before the content is loaded, but because the Script is executed after the content is loaded, the WebComponents are not defined yet
//   -->  Scripts that use WebComponents need to listen to the AJAXContentLoaded event and then create the WebComponents and not rely on the provided DOM

// Loaded CSS gets removed if the Node is removed

document.addEventListener('DOMContentLoaded', async function() {

    const contentElement = document.getElementById('content');
    if (!contentElement) {
        console.error('No content element found');
        return;
    }

    // default load home
    const response = await fetch('/home' + ADD_DEV);
    response.text().then(replaceContent(contentElement));

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
    
        const action = (sourceElement.getAttribute('action') || '') + ADD_DEV
        const method = sourceElement.getAttribute('method') || 'GET'
        
        // convert form data to URLSearchParams to send it as application/x-www-form-urlencoded
        // FormData will be send as multipart/form-data
        // actix expects application/x-www-form-urlencoded
        const formData = new URLSearchParams()
        new FormData(sourceElement).forEach((value, key) => {
            formData.append(key, value.toString())
        })
        
        console.group('AJAX From Submit:')
        console.log(action, method, formData)
        fetch(action, {
            method: method,
            body: formData
        }).then((response) => {
            console.log(response)
            console.groupEnd()
            response.text().then(replaceContent(contentElement))
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
         
            const action = (sourceElement.getAttribute('href') || '')  + ADD_DEV
            console.group('AJAX Page Load')
            console.log(action)
            const response = await fetch(action)
            console.log(response)
            console.groupEnd()
            response.text().then(replaceContent(contentElement))
        }
    })
})

function eventAjaxRequestEnabled(element: EventTarget | null): element is HTMLElement {
    return element instanceof HTMLElement && element.getAttribute('data-spa-request') !== null
}

// replaces content and properly executes scripts
function replaceContent(contentContainer: HTMLElement) {
    return (text: string) => {

        contentContainer.innerHTML = text // actual HTML5 Spec :)
    
        requestAnimationFrame(() => {

            const allScriptsLoaded: Promise<void>[] = []

            // get all script tags and replace them with new script tags
            // because spec says that script tags should not be executed when inserted via innerHTML
            contentContainer.querySelectorAll('script').forEach((script) => {
                const newScript = document.createElement('script')
                
                allScriptsLoaded.push(new Promise((resolve) => newScript.addEventListener('load', () => resolve())))
            
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
            Promise.all(allScriptsLoaded).then(() => {
                document.dispatchEvent(new Event('AJAXContentLoaded'))
            })
        })
    }
}