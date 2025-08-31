// @ts-nocheck
// Source: https://github.com/misund/hex-to-rgba/blob/master/src/index.js.
const removeHash = (hex) => (hex.charAt(0) === "#" ? hex.slice(1) : hex);

const parseHex = (nakedHex) => {
  const isShort = nakedHex.length === 3 || nakedHex.length === 4;

  const twoDigitHexR = isShort
    ? `${nakedHex.slice(0, 1)}${nakedHex.slice(0, 1)}`
    : nakedHex.slice(0, 2);
  const twoDigitHexG = isShort
    ? `${nakedHex.slice(1, 2)}${nakedHex.slice(1, 2)}`
    : nakedHex.slice(2, 4);
  const twoDigitHexB = isShort
    ? `${nakedHex.slice(2, 3)}${nakedHex.slice(2, 3)}`
    : nakedHex.slice(4, 6);
  const twoDigitHexA =
    (isShort
      ? `${nakedHex.slice(3, 4)}${nakedHex.slice(3, 4)}`
      : nakedHex.slice(6, 8)) || "ff";

  return {
    r: twoDigitHexR,
    g: twoDigitHexG,
    b: twoDigitHexB,
    a: twoDigitHexA,
  };
};

const hexToDecimal = (hex) => parseInt(hex, 16);

const hexesToDecimals = ({ r, g, b, a }) => ({
  r: hexToDecimal(r),
  g: hexToDecimal(g),
  b: hexToDecimal(b),
  a: +(hexToDecimal(a) / 255).toFixed(2),
});

// MODIFICATION:
// const isNumeric = (n) => !isNaN(parseFloat(n)) && isFinite(n);

// MODIFICATION:
// const formatRgb = (decimalObject, parameterA) => {
//   const { r, g, b, a: parsedA } = decimalObject;
//   const a = isNumeric(parameterA) ? parameterA : parsedA;
//
//   return `rgba(${r}, ${g}, ${b}, ${a})`;
// };

// MODIFICATION:
/** @type {(hex: string) => {r: number, g: number, b: number, a: number}} */
// MODIFICATION:
const hexToRgba = (hex) => {
  const hashlessHex = removeHash(hex);
  const hexObject = parseHex(hashlessHex);
  const decimalObject = hexesToDecimals(hexObject);

  // MODIFICATION:
  return decimalObject;
  // return formatRgb(decimalObject, a);
};

// MODIFICATION:
export { hexToRgba };
