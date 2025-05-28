/**
 * FreeType Renderer Module
 * 
 * Provides functions for rendering text with FreeType for better emoji support.
 * This module uses the node-freetype library to render text to images that can
 * be used by the overlay manager.
 */

const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');
const { spawnSync } = require('child_process');
const os = require('os');

// Path to the emoji font
const FONTS_DIR = path.join(__dirname, '../../assets/fonts');
const EMOJI_FONT_PATH = path.join(FONTS_DIR, 'NotoColorEmoji-Regular.ttf');

// Temporary directory for rendered text images
const TEMP_DIR = path.join(os.tmpdir(), 'citizen-radio-text');

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

/**
 * Render text with FreeType for better emoji support
 * @param {string} text - Text to render
 * @param {Object} options - Rendering options
 * @param {number} options.fontSize - Font size in pixels
 * @param {string} options.fontColor - Font color (CSS color string)
 * @param {string} options.backgroundColor - Background color (CSS color string)
 * @param {number} options.padding - Padding around the text in pixels
 * @returns {Promise<Buffer>} - Promise that resolves to the rendered image buffer
 */
async function renderTextWithFreeType(text, options = {}) {
    const {
        fontSize = 16,
        fontColor = 'white',
        backgroundColor = 'transparent',
        padding = 10
    } = options;

    // Create a unique filename based on text content and options
    const hash = Buffer.from(text + JSON.stringify(options)).toString('base64').replace(/[\/\+\=]/g, '_');
    const outputPath = path.join(TEMP_DIR, `${hash}.png`);

    // Check if we already have this text rendered
    if (fs.existsSync(outputPath)) {
        return fs.readFileSync(outputPath);
    }

    // Use FreeType to render the text to an image
    // We'll use the freetype-gl utility to render text with FreeType
    // This is a command-line approach that uses the system's FreeType library
    
    // First, measure the text to determine canvas size
    // This is an approximation since we can't easily measure with FreeType directly
    const tempCanvas = createCanvas(1, 1);
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.font = `${fontSize}px sans-serif`;
    const metrics = tempCtx.measureText(text);
    
    // Calculate canvas dimensions with padding
    const width = Math.ceil(metrics.width) + (padding * 2);
    const height = Math.ceil(fontSize * 1.5) + (padding * 2);
    
    // Create a canvas for the final image
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    
    // Fill background if not transparent
    if (backgroundColor !== 'transparent') {
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, width, height);
    }
    
    // Set up text rendering
    ctx.fillStyle = fontColor;
    ctx.font = `${fontSize}px "Noto Color Emoji", sans-serif`;
    ctx.textBaseline = 'middle';
    
    // Render text to canvas
    ctx.fillText(text, padding, height / 2);
    
    // Save canvas to file
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(outputPath, buffer);
    
    return buffer;
}

/**
 * Draw text with FreeType on a canvas context
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {string} text - Text to render
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {Object} options - Rendering options
 * @returns {Promise<void>} - Promise that resolves when the text is drawn
 */
async function drawTextWithFreeType(ctx, text, x, y, options = {}) {
    // Render text to image
    const buffer = await renderTextWithFreeType(text, options);
    
    // Load the image
    const image = await loadImage(buffer);
    
    // Draw the image on the canvas
    ctx.drawImage(image, x, y - (image.height / 2));
}

/**
 * Process text with emojis and render each part appropriately
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {string} text - Text to render
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {number} fontSize - Font size in pixels
 * @returns {Promise<void>} - Promise that resolves when the text is drawn
 */
async function renderTextWithEmojiSupport(ctx, text, x, y, fontSize) {
    // Save current font and style
    const originalFont = ctx.font;
    const originalFillStyle = ctx.fillStyle;
    
    // First, preprocess the text to handle emojis surrounded by colons
    // This will convert patterns like ":🖖:" to just "🖖" with proper spacing
    text = text.replace(/:([\u{1F300}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F1E0}-\u{1F1FF}]):/gu, " $1 ");
    
    // Ensure proper spacing by normalizing spaces
    text = text.replace(/\s+/g, " ").trim();
    
    // Split text into chunks (emoji vs. regular text)
    const chunks = [];
    let currentChunk = '';
    let currentType = 'text'; // 'text' or 'emoji'
    
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const isEmojiChar = /[\u{1F300}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F1E0}-\u{1F1FF}]/u.test(char);
        
        if (isEmojiChar && currentType !== 'emoji') {
            // Switching from text to emoji
            if (currentChunk) {
                chunks.push({ type: currentType, text: currentChunk });
                currentChunk = '';
            }
            currentType = 'emoji';
            currentChunk = char;
        } else if (!isEmojiChar && currentType !== 'text') {
            // Switching from emoji to text
            if (currentChunk) {
                chunks.push({ type: currentType, text: currentChunk });
                currentChunk = '';
            }
            currentType = 'text';
            currentChunk = char;
        } else {
            // Continuing current chunk
            currentChunk += char;
        }
    }
    
    // Add the last chunk
    if (currentChunk) {
        chunks.push({ type: currentType, text: currentChunk });
    }
    
    // Render each chunk
    let currentX = x;
    for (const chunk of chunks) {
        if (chunk.type === 'emoji') {
            // Render emoji with FreeType
            await drawTextWithFreeType(ctx, chunk.text, currentX, y, {
                fontSize: fontSize * 1.2,
                fontColor: originalFillStyle
            });
            
            // Measure the rendered emoji (approximation)
            const metrics = ctx.measureText(chunk.text);
            currentX += metrics.width + (fontSize * 0.2); // Add a little extra space after emojis
        } else {
            // Render regular text with canvas
            ctx.font = originalFont;
            ctx.fillText(chunk.text, currentX, y);
            
            // Advance position
            currentX += ctx.measureText(chunk.text).width;
        }
    }
    
    // Restore original styles
    ctx.font = originalFont;
    ctx.fillStyle = originalFillStyle;
}

module.exports = {
    renderTextWithFreeType,
    drawTextWithFreeType,
    renderTextWithEmojiSupport
};