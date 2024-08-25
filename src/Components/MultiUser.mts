
let host = window.location.host
let canvasPath = window.location.pathname

console.log("WS Connecting to", host, canvasPath)
const socket = new WebSocket(`ws://${host}/ws${canvasPath}`)

socket.onopen = (event) => {
    console.log("Connected to server", event);
}

socket.onmessage = (event) => {
    console.log(event)
}

socket.onerror = (event) => {
    console.error(event)
}