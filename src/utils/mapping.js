/**
 * Linearly maps x from [inMin, inMax] to [outMin, outMax].
 */
function mapRange(x, inMin, inMax, outMin, outMax) {
    return (x - inMin) * (outMax - outMin) / (inMax - inMin) + outMin;
}

/**
 * Remaps x from [50,200] into [1,10].
 */
function map50to200to1to10(x) {
    return mapRange(x, 50, 200, 1, 10);
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function mapAndClamp(x) {
    const mapped = map50to200to1to10(x);
    return clamp(mapped, 1, 10);
}