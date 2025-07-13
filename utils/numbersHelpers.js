function parseLocaleNumber(str) {
  if (typeof str !== "string") return NaN;

  str = str.trim();

  const hasComma = str.includes(",");
  const hasDot = str.includes(".");

  // Case 1: both separators exist
  if (hasComma && hasDot) {
    const lastComma = str.lastIndexOf(",");
    const lastDot = str.lastIndexOf(".");

    if (lastComma > lastDot) {
      // Likely European style: "1.234,56"
      return parseFloat(str.replace(/\./g, "").replace(",", "."));
    } else {
      // Likely US/EN style: "1,234.56"
      return parseFloat(str.replace(/,/g, ""));
    }
  }

  // Case 2: only comma
  if (hasComma) {
    // Assume comma is decimal separator (European)
    return parseFloat(str.replace(",", "."));
  }

  // Case 3: only dot or plain number
  return parseFloat(str);
}

module.exports = {
  parseLocaleNumber,
};
