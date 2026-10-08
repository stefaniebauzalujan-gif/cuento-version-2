// Configuración del worker para PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

// Elementos del DOM
const bookContainer = document.getElementById('flip-book');
const mainContainer = document.querySelector('.book-container');
const loading = document.getElementById('loading');
const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const btnZoomIn = document.getElementById('btn-zoom-in');
const btnZoomOut = document.getElementById('btn-zoom-out');
const btnReadAloud = document.getElementById('btn-read-aloud');
const pageIndicator = document.getElementById('page-indicator');

let pageFlip = null;
let currentZoom = 1.0;
let pageTexts = []; // Almacenará el texto de cada página para la lectura en voz alta
let synth = window.speechSynthesis;
let isSpeaking = false;

// Carga automática al iniciar la página
document.addEventListener('DOMContentLoaded', () => {
    loadRepoPDF();
});

// 1. Función para cargar 'cuento.pdf' desde la raíz del repositorio
async function loadRepoPDF() {
    try {
        const pdfUrl = './cuento.pdf';
        const pdf = await pdfjsLib.getDocument(pdfUrl).promise;
        const totalPages = pdf.numPages;

        // Renderizar dimensiones según la primera página
        const firstPage = await pdf.getPage(1);
        const viewportInfo = firstPage.getViewport({ scale: 1.5 });
        const pageWidth = viewportInfo.width;
        const pageHeight = viewportInfo.height;

        bookContainer.innerHTML = '';
        pageTexts = [];

        // Procesar cada página para canvas y extraer texto accesible
        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const viewport = page.getViewport({ scale: 1.5 });

            // Renderizar dibujo de página
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            await page.render({ canvasContext: context, viewport: viewport }).promise;

            const pageDiv = document.createElement('div');
            pageDiv.className = 'page';
            pageDiv.appendChild(canvas);
            bookContainer.appendChild(pageDiv);

            // Extraer texto para síntesis de voz
            const textContent = await page.getTextContent();
            const textString = textContent.items.map(item => item.str).join(' ');
            pageTexts.push(textString || `Página ${pageNum}`);
        }

        // Inicializar St.PageFlip
        bookContainer.style.display = 'block';
        pageFlip = new St.PageFlip(bookContainer, {
            width: pageWidth,
            height: pageHeight,
            size: "stretch",
            minWidth: 300,
            maxWidth: pageWidth * 1.2,
            minHeight: 400,
            maxHeight: pageHeight * 1.2,
            showCover: true,
            maxShadowOpacity: 0.6,
            usePortrait: true
        });

        const pages = document.querySelectorAll('.page');
        pageFlip.loadFromHTML(pages);

        // Evento al cambiar de página
        pageFlip.on('flip', (e) => {
            playPageTurnSound(); // Reproducir sonido de hoja
            updatePageIndicator();
            if (isSpeaking) {
                stopSpeech();
                speakCurrentPage();
            }
        });

        updatePageIndicator();
        loading.style.display = 'none';

    } catch (error) {
        console.error('Error al cargar cuento.pdf:', error);
        loading.innerText = 'No se encontró o no se pudo procesar el archivo "cuento.pdf" en el repositorio.';
    }
}

// 2. Reproducción Sintetizada de Sonido de Hoja (Web Audio API)
function playPageTurnSound() {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();

        // Generar ruido blanco suave simulando el roce de papel
        const bufferSize = ctx.sampleRate * 0.15; // 150ms
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = ctx.createBufferSource();
        noise.buffer = buffer;

        // Filtro para dar textura de papel
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 1200;
        filter.Q.value = 1.2;

        // Control de volumen / envolvente
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.01, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        noise.start();
        noise.stop(ctx.currentTime + 0.15);
    } catch (err) {
        console.warn('AudioContext no permitido o no soportado.', err);
    }
}

// 3. Botones de Navegación Manual
btnPrev.addEventListener('click', () => {
    if (pageFlip) pageFlip.flipPrev();
});

btnNext.addEventListener('click', () => {
    if (pageFlip) pageFlip.flipNext();
});

function updatePageIndicator() {
    if (!pageFlip) return;
    const page = pageFlip.getCurrentPageIndex() + 1;
    const total = pageFlip.getPageCount();
    pageIndicator.innerText = `Pág. ${page} de ${total}`;
}

// 4. Aumento / Reducción de Tamaño (Baja Visión / Accesibilidad)
btnZoomIn.addEventListener('click', () => {
    if (currentZoom < 1.6) {
        currentZoom += 0.15;
        applyZoom();
    }
});

btnZoomOut.addEventListener('click', () => {
    if (currentZoom > 0.7) {
        currentZoom -= 0.15;
        applyZoom();
    }
});

function applyZoom() {
    mainContainer.style.transform = `scale(${currentZoom})`;
    mainContainer.style.transformOrigin = 'top center';
}

// 5. Lectura en Voz Alta (Text-To-Speech en Español)
btnReadAloud.addEventListener('click', () => {
    if (isSpeaking) {
        stopSpeech();
    } else {
        speakCurrentPage();
    }
});

function speakCurrentPage() {
    if (!synth || !pageFlip) return;

    const pageIndex = pageFlip.getCurrentPageIndex();
    const textToRead = pageTexts[pageIndex];

    if (!textToRead || textToRead.trim() === '') {
        alert('No se detectó texto en esta página.');
        return;
    }

    const utterance = new SpeechSynthesisUtterance(textToRead);
    utterance.lang = 'es-ES'; // Configurado en Español
    utterance.rate = 0.9; // Velocidad ligeramente pausada para niños

    // Buscar voz en español disponible
    const voices = synth.getVoices();
    const spanishVoice = voices.find(voice => voice.lang.startsWith('es'));
    if (spanishVoice) {
        utterance.voice = spanishVoice;
    }

    utterance.onstart = () => {
        isSpeaking = true;
        btnReadAloud.innerText = '⏹️ Detener Lectura';
        btnReadAloud.classList.add('speaking');
    };

    utterance.onend = () => {
        stopSpeech();
    };

    utterance.onerror = () => {
        stopSpeech();
    };

    synth.speak(utterance);
}

function stopSpeech() {
    if (synth) synth.cancel();
    isSpeaking = false;
    btnReadAloud.innerText = '🔊 Leer en voz alta';
    btnReadAloud.classList.remove('speaking');
}

// Cargar voces en navegadores donde se obtienen de forma asíncrona
if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = () => synth.getVoices();
}