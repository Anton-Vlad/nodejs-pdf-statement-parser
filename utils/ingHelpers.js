function ingIdentifyBank(text) {
  if (text.includes("RB-PJS-40 024/18.02.99")) {
    return "ING";
  }
  return null;
}

function ingExtractInitialBalance(text) {
  const initialBalanceRegex = /Sold initial:\s*(\d{1,3}(?:\.\d{3})*,\d{2})/;
  const foundMatches = text.match(initialBalanceRegex);
  if (foundMatches) {
    // // Replace dots with empty strings and commas with dots for correct float conversion
    // const initialBalance = match1[1].replace(/\./g, "").replace(/,/g, ".");
    // return parseFloat(initialBalance);
    return foundMatches[1];
  }
  return null; // Return null if no match is found
}

function ingExtractFinalBalance(text) {
  const finalBalanceRegex = /Sold final\s*(\d{1,3}(?:\.\d{3})*,\d{2})/;
  const foundMatches = text.match(finalBalanceRegex);
  if (foundMatches) {
    // // Replace dots with empty strings and commas with dots for correct float conversion
    // const finalBalance = match1[1].replace(/\./g, "").replace(/,/g, ".");
    // return parseFloat(finalBalance);
    return foundMatches[1];
  }
  return null;
}

function ingExtractCurrency(text) {
  // List of expected currencies
  const validCurrencies = ["RON", "EUR", "USD"];

  // Regular expression to match any of the valid currencies possibly followed by more text
  const currencyRegex = new RegExp(
    `(${validCurrencies.join("|")})([A-Z]*\\d*|[A-Z]+\\d*)`,
    "g"
  );
  let matches;
  let foundCurrencies = [];

  while ((matches = currencyRegex.exec(text)) !== null) {
    foundCurrencies.push(matches[1]);
  }

  // Return the first valid currency found or null if none
  return foundCurrencies.length > 0 ? foundCurrencies[0] : null;
}

function ingExtractStatementDates(text) {
  const regex = /(\d{2})\/(\d{2})\/(\d{4})-(\d{2})\/(\d{2})\/(\d{4})/;
  const match = text.match(regex);

  if (!match) return null;

  const [, d1, m1, y1, d2, m2, y2] = match;

  const format = (y, m, d) =>
    `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;

  return {
    startDate: format(y1, m1, d1),
    endDate: format(y2, m2, d2),
  };
}

function ingStatementParse(data, currency = "RON") {
  return {
    bank: "ING",
    currency: currency,
    initialBalance: ingExtractInitialBalance(data),
    finalBalance: ingExtractFinalBalance(data),
    transactions: [],
  };
}

module.exports = {
  ingExtractInitialBalance,
  ingExtractFinalBalance,
  ingStatementParse,
  ingIdentifyBank,
  ingExtractCurrency,
  ingExtractStatementDates,
};
