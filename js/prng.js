function createPRNG(seed) {
    return function () {
        let t = seed += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

function compressFog(arr) {
    if (!arr || arr.length === 0) return "";
    let max = Math.max(...arr);
    let hex = "";
    for (let i = 0; i <= max; i += 4) {
        let val = 0;
        if (arr.includes(i)) val |= 1;
        if (arr.includes(i + 1)) val |= 2;
        if (arr.includes(i + 2)) val |= 4;
        if (arr.includes(i + 3)) val |= 8;
        hex += val.toString(16);
    }
    return hex.replace(/0+$/, '');
}

function decompressFog(hex) {
    if (!hex) return [];
    let arr = [];
    for (let i = 0; i < hex.length; i++) {
        let val = parseInt(hex[i], 16);
        if (val & 1) arr.push(i * 4);
        if (val & 2) arr.push(i * 4 + 1);
        if (val & 4) arr.push(i * 4 + 2);
        if (val & 8) arr.push(i * 4 + 3);
    }
    return arr;
}
