function ingIdentifyBank(text) {
  if (text.includes("RB-PJS-40 024/18.02.99")) {
    return "ING";
  }
  return null;
}

function ingExtractInitialBalance(text) {
  const initialBalanceRegex = /Sold initial:\s*(\d{1,3}(?:\.\d{3})*,\d{2})/;
  const match1 = text.match(initialBalanceRegex);
  if (match1) {
    // Replace dots with empty strings and commas with dots for correct float conversion
    const initialBalance = match1[1].replace(/\./g, "").replace(/,/g, ".");
    return parseFloat(initialBalance);
  }
  return null; // Return null if no match is found
}

function ingExtractFinalBalance(text) {
  const finalBalanceRegex = /Sold final\s*(\d{1,3}(?:\.\d{3})*,\d{2})/;
  const match1 = text.match(finalBalanceRegex);
  if (match1) {
    // Replace dots with empty strings and commas with dots for correct float conversion
    const finalBalance = match1[1].replace(/\./g, "").replace(/,/g, ".");
    return parseFloat(finalBalance);
  }
  return null; // Return null if no match is found
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
};
