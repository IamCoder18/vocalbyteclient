const bufferSize = 4096
const scroller = document.querySelector('#textDisplay')
const anchor = document.querySelector('#anchor')
const btnMic = document.querySelector("#btnMic")
const btnMicIcon = document.querySelector("#btnMicIcon")
const recordStatus = document.querySelector("#recordStatus")
const transcribeStatus = document.querySelector("#transcribeStatus")
let websocket
let context
let processor
let globalStream
let isRecording = false

// Call to initialize
function initWebSocket() {
    const websocketAddress = "wss://162.157.112.2"

    // const selectedLanguage = document.getElementById('languageSelect').value
    language = null

    websocket = new WebSocket(websocketAddress)
    websocket.onopen = () => {
        console.log("WebSocket connection established")
    }
    websocket.onclose = event => {
        const transcriptionDiv = document.createElement("div")
        transcriptionDiv.className = "voiceText"
        transcriptionDiv.innerText = "Sorry, an error occured, please reload. If the issue persists, please reload after 5 minutes."
        console.log("WebSocket connection closed", event)   
    }
    websocket.onmessage = event => {
        console.log("Message from server:", event.data)
        const transcript_data = JSON.parse(event.data)
        updateTranscription(transcript_data)
    }
}

function updateTranscription(transcript_data) {
    transcribeStatus.innerText = "Waiting"
    if (transcript_data['words'] && transcript_data['words'].length > 0) {
        const transcriptionDiv = document.createElement("div")
        transcriptionDiv.className = "voiceText"
        transcript_data['words'].forEach(wordData => {
            const span = document.createElement('span')
            const probability = wordData['probability']
            span.textContent = wordData['word'] + ' '

            if (probability > 0.6) {
                span.style.color = 'black'
            } else if (probability < 0.6) {
                span.style.color = 'red'
            }
            transcriptionDiv.appendChild(span)
        })

        scroller.insertBefore(transcriptionDiv, anchor)
    }

    console.log("DEBUG: Transcription took " + transcript_data['processing_time'].toFixed(2).toString() + ' seconds.')
}

function startRecording() {
    if (isRecording) return
    isRecording = true

    const AudioContext = window.AudioContext || window.webkitAudioContext
    context = new AudioContext()

    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
        globalStream = stream
        const input = context.createMediaStreamSource(stream)
        processor = context.createScriptProcessor(bufferSize, 1, 1)
        processor.onaudioprocess = e => processAudio(e)
        input.connect(processor)
        processor.connect(context.destination)

        sendAudioConfig()
    }).catch(error => console.error('Error accessing microphone', error))
}

function stopRecording() {
    if (!isRecording) return
    isRecording = false

    if (globalStream) {
        globalStream.getTracks().forEach(track => track.stop())
    }
    if (processor) {
        processor.disconnect()
        processor = null
    }
    if (context) {
        context.close().then(() => context = null)
    }
}

function sendAudioConfig() {
    const audioConfig = {
        type: 'config',
        language: language,
    }

    websocket.send(JSON.stringify(audioConfig))
    console.log("Config Sent To Server")
}

function downsampleBuffer(buffer, inputSampleRate, outputSampleRate) {
    if (inputSampleRate === outputSampleRate) {
        return buffer
    }
    var sampleRateRatio = inputSampleRate / outputSampleRate
    var newLength = Math.round(buffer.length / sampleRateRatio)
    var result = new Float32Array(newLength)
    var offsetResult = 0
    var offsetBuffer = 0
    while (offsetResult < result.length) {
        var nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio)
        var accum = 0, count = 0
        for (var i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
            accum += buffer[i]
            count++
        }
        result[offsetResult] = accum / count
        offsetResult++
        offsetBuffer = nextOffsetBuffer
    }
    return result
}

function processAudio(e) {
    const inputSampleRate = context.sampleRate
    const outputSampleRate = 16000

    const left = e.inputBuffer.getChannelData(0)
    const downsampledBuffer = downsampleBuffer(left, inputSampleRate, outputSampleRate)
    const audioData = convertFloat32ToInt16(downsampledBuffer)

    if (websocket && websocket.readyState === WebSocket.OPEN) {
        websocket.send(audioData)
        transcribeStatus.innerText = "Transcribing"
    }
}

function convertFloat32ToInt16(buffer) {
    let l = buffer.length
    const buf = new Int16Array(l)
    while (l--) {
        buf[l] = Math.min(1, buffer[l]) * 0x7FFF
    }
    return buf.buffer
}

btnMic.addEventListener("click", () => {
    if (btnMicIcon.innerText == "mic") {
        btnMicIcon.innerText = "mic_off"
        recordStatus.innerText = "Muted"
        stopRecording()
    } else if (btnMicIcon.innerText == "mic_off") {
        btnMicIcon.innerText = "mic"
        recordStatus.innerText = "Recording"
        startRecording()
    }
})

document.addEventListener('DOMContentLoaded', () => {
    console.log("Waiting for websocket")
    initWebSocket()
    document.querySelector("#textDisplay").scroll(0, 1)
})